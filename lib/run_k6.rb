$LOAD_PATH.unshift File.expand_path('.', __dir__)

require 'chronic_duration'
require 'test_info'
require 'down/http'
require 'fileutils'
require 'gpt_common'
require 'json'
require 'open3'
require 'os'
require 'rainbow'
require 'table_print'
require 'tmpdir'

module RunK6
  extend self

  def setup_k6
    k6_version = ENV['K6_VERSION'] || '0.26.0'

    ['k6', File.join(Dir.tmpdir, 'k6')].each do |k6|
      return k6 if Open3.capture2e("#{k6} version" + ';')[0].strip.match?(/^k6 v#{k6_version}/)
    end

    if OS.linux?
      k6_url = ENV['K6_URL'] || "https://github.com/loadimpact/k6/releases/download/v#{k6_version}/k6-v#{k6_version}-linux#{OS.bits}.tar.gz"
      warn Rainbow("k6 not found or different version detected. Downloading k6 v#{k6_version} from #{k6_url} to system temp folder...").yellow

      k6_archive = Down::Http.download(k6_url)
      extract_output, extract_status = Open3.capture2e('tar', '-xzvf', k6_archive.path, '-C', File.dirname(k6_archive.path), '--strip-components', '1')
      raise "k6 archive extract failed:\b#{extract_output}" unless extract_status.success?
    elsif OS.mac?
      k6_url = ENV['K6_URL'] || "https://github.com/loadimpact/k6/releases/download/v#{k6_version}/k6-v#{k6_version}-mac.zip"
      warn Rainbow("k6 not found or wrong version detected. Downloading k6 version #{k6_version} from #{k6_url} to system temp folder...").yellow

      k6_archive = Down::Http.download(k6_url)
      extract_output, extract_status = Open3.capture2e('unzip', '-j', k6_archive.path, '-d', File.dirname(k6_archive.path))
      raise "k6 archive extract failed:\b#{extract_output}" unless extract_status.success?
    elsif OS.windows?
      raise "k6 not found or wrong version detected. Please install k6 version #{k6_version} on your machine and ensure it's found on the PATH"
    end

    File.join(File.dirname(k6_archive.path), 'k6')
  end

  def setup_env_vars(env_file:, options_file:, latency:)
    env_vars = {}
    env_file_vars = JSON.parse(File.read(env_file))

    env_vars['ENVIRONMENT_NAME'] = ENV['ENVIRONMENT_NAME'].dup || env_file_vars['environment']['name']
    env_vars['ENVIRONMENT_URL'] = (ENV['ENVIRONMENT_URL'].dup || env_file_vars['environment']['url']).chomp('/')
    env_vars['ENVIRONMENT_PROJECTS'] = env_file_vars['projects'].to_json

    options_file_vars = JSON.parse(File.read(options_file))
    env_vars['OPTION_RPS'] = options_file_vars['rps'].to_s
    env_vars['OPTION_RPS_COUNT'] ||= begin
      duration = options_file_vars['stages'].inject(0.0) { |sum, n| sum + n['duration'].delete('a-z').to_f }
      (duration * options_file_vars['rps'].to_f).to_i.to_s
    end
    env_vars['OPTION_STAGES'] = options_file_vars['stages'].to_json

    env_vars['SUCCESS_RATE_THRESHOLD'] ||= '0.95'
    env_vars['TTFB_THRESHOLD'] ||= '500'
    env_vars['TTFB_LATENCY'] ||= latency.to_s

    env_vars['GIT_ENDPOINT_THROUGHPUT'] ||= '0.1'
    env_vars['WEB_ENDPOINT_THROUGHPUT'] ||= '0.1'
    env_vars['SCENARIO_ENDPOINT_THROUGHPUT'] ||= '0.05'

    env_vars
  end

  def get_env_version(env_vars:)
    headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    res = GPTCommon.make_http_request(method: 'get', url: "#{env_vars['ENVIRONMENT_URL']}/api/v4/version", headers: headers, fail_on_error: false)
    res.status.success? ? JSON.parse(res.body.to_s) : { "version" => "-", "revision" => "-" }
  end

  def get_tests(k6_dir:, test_paths:, test_excludes: [], quarantined:, scenarios:, read_only:, env_version: '-')
    tests = []
    test_paths.each do |test_path|
      # Add any tests found within given and default folders matching name
      test_globs = Dir.glob([test_path, "#{k6_dir}/#{test_path}", "#{k6_dir}/tests/#{test_path}", "#{ENV['GPT_DOCKER_TESTS_DIR'] || ''}/#{test_path}"])
      test_globs.each do |test_glob|
        tests += Dir.glob(["#{test_glob}.js", "#{test_glob}/*.js", "#{test_glob}/api/*.js", "#{test_glob}/git/*.js", "#{test_glob}/web/*.js"])
        tests += Dir.glob("#{test_glob}/quarantined/*.js") if quarantined
        tests += Dir.glob("#{test_glob}/scenarios/*.js") if scenarios
      end

      # Add any test files given directly if they exist and are of .js type
      tests += Dir.glob("#{File.dirname(test_path)}/#{File.basename(test_path, File.extname(test_path))}.js")
      # Add any tests given by name directly in default folder with or with extension
      tests += Dir.glob("#{k6_dir}/tests/*/#{File.basename(test_path, File.extname(test_path))}.js")
    end
    raise "\nNo tests found in specified path(s):\n#{test_paths.join("\n")}\nExiting..." if tests.empty?

    tests = tests.uniq.sort_by { |path| File.basename(path, '.js') }
    test_excludes.each do |exclude|
      tests.reject! { |test| test.include? exclude }
    end

    tests.select! { |test| TestInfo.test_is_read_only?(test) } if read_only
    tests.select! { |test| TestInfo.test_supported_by_version?(test, env_version) } unless env_version == '-'

    tests
  end

  def run_k6(k6_path:, env_vars:, options_file:, test_file:, gpt_version:)
    test_name = File.basename(test_file, '.js')
    puts "Running k6 test '#{test_name}' against environment '#{env_vars['ENVIRONMENT_NAME']}'..."

    cmd = [k6_path, 'run']
    cmd += ['--config', options_file] if options_file
    cmd += ['--summary-time-unit', 'ms']
    cmd += ['--user-agent', "GPT/#{gpt_version}"]
    cmd += [test_file]

    status = nil
    output = []
    Open3.popen2e(env_vars, *cmd) do |stdin, stdout_stderr, wait_thr|
      stdin.close
      stdout_stderr.each do |line|
        raise ArgumentError, "Test '#{test_name}' requires environment variable ACCESS_TOKEN to be set. Skipping...\n" if line.match?(/(GoError:).*(ACCESS_TOKEN)/)
        raise "No requests completed in time by the end of the test. This is likely due to no responses being received from the server.\n" if line.match?(/No data generated/)

        output << line
        puts line
      end
      status = wait_thr.value
    end

    [status.success?, output]
  end

  def parse_k6_results(status:, output:)
    matches = {}
    matches[:success] = status

    output.each do |line|
      case line
      when /^\s*script: /
        matches[:name] = line.match(/([a-z0-9_]*).js/)
      when /http_req_waiting/
        matches[:ttfb_avg] = line.match(/(avg=)(\d+\.\d+)([a-z]+)/)
        matches[:ttfb_p90] = line.match(/(p\(90\)=)(\d+\.\d+)([a-z]+)/)
        matches[:ttfb_p95] = line.match(/(p\(95\)=)(\d+\.\d+)([a-z]+)/)
      when /vus_max/
        matches[:rps_target] = line.match(/max=(\d+)/)
      when /RPS Threshold:/
        matches[:rps_threshold] = line.match(/(\d+\.\d+)\/s/)
      when /TTFB P90 Threshold:/
        matches[:ttfb_threshold] = line.match(/(\d+)ms/)
      when /http_reqs/
        matches[:rps_result] = line.match(/(\d+(\.\d+)?)(\/s)/)
      when /Success Rate Threshold/
        matches[:success_rate_threshold] = line.match(/\d+(\.\d+)?\%/)
      when /successful_requests/
        matches[:success_rate] = line.match(/\d+(\.\d+)?\%/)
      end
    end

    results = {}
    results["name"] = matches[:name][1]
    results["rps_target"] = matches[:rps_target][1]
    results["rps_result"] = matches[:rps_result][1].to_f.round(2).to_s
    results["rps_threshold"] = matches[:rps_threshold][1]
    results["ttfb_avg"] = matches[:ttfb_avg][2]
    results["ttfb_p90"] = matches[:ttfb_p90][2]
    results["ttfb_p90_threshold"] = matches[:ttfb_threshold][1]
    results["ttfb_p95"] = matches[:ttfb_p95][2]
    results["success_rate"] = matches[:success_rate][0]
    results["success_rate_threshold"] = matches[:success_rate_threshold][0]
    results["result"] = status

    results
  end

  def generate_results_summary(results_json:)
    <<~DOC
      * Environment:                #{results_json['name'].capitalize}
      * Environment Version:        #{results_json['version']} `#{results_json['revision']}`
      * Option:                     #{results_json['option']}
      * Date:                       #{results_json['date']}
      * Run Time:                   #{ChronicDuration.output(results_json['time']['run'], format: :short)} (Start: #{results_json['time']['start']}, End: #{results_json['time']['end']})
      * GPT Version:                v#{results_json['gpt_version']}
    DOC
  end

  def generate_results_table(results_json:)
    tp_results = results_json['test_results'].map do |test_result|
      tp_result = {}
      tp_result["Name"] = test_result['name']
      tp_result["RPS"] = "#{test_result['rps_target']}/s"
      tp_result["RPS Result"] = "#{test_result['rps_result']}/s (>#{test_result['rps_threshold']}/s)"
      tp_result["TTFB Avg"] = "#{test_result['ttfb_avg']}ms"
      tp_result["TTFB P90"] = "#{test_result['ttfb_p90']}ms (<#{test_result['ttfb_p90_threshold']}ms)"
      tp_result["Req Status"] = "#{test_result['success_rate']} (>#{test_result['success_rate_threshold']})"

      test_result_str = test_result['result'] ? "Passed" : "FAILED"
      test_result_str << '¹' if test_result['known_issue']
      test_result_str << '²' unless test_result['result']
      tp_result["Result"] = test_result['result'] ? Rainbow(test_result_str).green : Rainbow(test_result_str).red

      tp_result
    end

    tp.set(:max_width, 60)
    TablePrint::Printer.table_print(tp_results)
  end

  def generate_results_footer(results_json:)
    footer = ''
    footer << "\n¹ Result covers endpoint(s) that have known issue(s). Threshold(s) have been adjusted to compensate." if results_json['test_results'].any? { |test_result| test_result['known_issue'] }
    footer << "\n² Failure may not be clear from summary alone. Refer to the individual test's full output for further debugging." unless results_json['overall_result']
    footer
  end
end
