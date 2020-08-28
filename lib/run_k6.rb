$LOAD_PATH.unshift File.expand_path('.', __dir__)

require 'chronic_duration'
require 'test_info'
require 'down/http'
require 'fileutils'
require 'gpt_common'
require 'json'
require 'open3'
require 'os'
require 'gpt_prepare_test_data'
require 'rainbow'
require 'table_print'
require 'tmpdir'

module RunK6
  extend self

  def setup_k6
    k6_version = ENV['K6_VERSION'] || '0.27.1'

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

  def get_env_version(env_url:)
    headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    res = GPTCommon.make_http_request(method: 'get', url: "#{env_url}/api/v4/version", headers: headers, fail_on_error: false)
    res.status.success? ? JSON.parse(res.body.to_s) : { "version" => "-", "revision" => "-" }
  end

  def get_env_settings(env_url:)
    return nil unless ENV['ACCESS_TOKEN']

    headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    res = GPTCommon.make_http_request(method: 'get', url: "#{env_url}/api/v4/application/settings", headers: headers, fail_on_error: false)
    res.status.success? ? JSON.parse(res.body.to_s) : {}
  end

  def setup_env_vars(k6_dir:, env_file:, options_file:)
    env_vars = {}
    env_file_vars = JSON.parse(File.read(env_file))

    env_vars['ENVIRONMENT_NAME'] = ENV['ENVIRONMENT_NAME'].dup || env_file_vars['environment']['name']
    env_vars['ENVIRONMENT_URL'] = (ENV['ENVIRONMENT_URL'].dup || env_file_vars['environment']['url']).chomp('/')
    env_vars['ENVIRONMENT_USER'] = ENV['ENVIRONMENT_USER'].dup || env_file_vars['environment']['user']
    env_vars['ENVIRONMENT_RPS'] = env_file_vars['environment']['rps'].to_s
    env_vars['ENVIRONMENT_LATENCY'] = ENV['ENVIRONMENT_LATENCY'].dup || env_file_vars['environment'].dig('config', 'latency')
    env_vars['ENVIRONMENT_LARGE_PROJECTS'] = GPTPrepareTestData.prepare_vertical_json_data(k6_dir: k6_dir, env_file_vars: env_file_vars)
    env_vars['ENVIRONMENT_MANY_GROUPS_AND_PROJECTS'] = GPTPrepareTestData.prepare_horizontal_json_data(env_file_vars: env_file_vars)

    env_vars['RPS_THRESHOLD_MULTIPLIER'] = ENV['RPS_THRESHOLD_MULTIPLIER'].dup || '0.8'
    env_vars['SUCCESS_RATE_THRESHOLD'] = ENV['SUCCESS_RATE_THRESHOLD'].dup || '0.95'
    env_vars['TTFB_THRESHOLD'] = ENV['TTFB_THRESHOLD'].dup || '500'

    env_vars['GIT_ENDPOINT_THROUGHPUT'] = ENV['GIT_ENDPOINT_THROUGHPUT'].dup || '0.1'
    env_vars['WEB_ENDPOINT_THROUGHPUT'] = ENV['WEB_ENDPOINT_THROUGHPUT'].dup || '0.1'
    env_vars['SCENARIO_ENDPOINT_THROUGHPUT'] = ENV['SCENARIO_ENDPOINT_THROUGHPUT'].dup || '0.01'

    env_version = get_env_version(env_url: env_vars['ENVIRONMENT_URL'])
    env_vars['ENVIRONMENT_VERSION'] = env_version['version']
    env_vars['ENVIRONMENT_REVISION'] = env_version['revision']

    env_vars
  end

  def prepare_tests(tests:, env_vars:)
    # Prepare specific test data
    GPTPrepareTestData.prepare_git_push_data(env_vars: env_vars) unless tests.grep(/git_push/).empty? || env_vars.empty?
  end

  def get_tests(k6_dir:, test_paths:, test_excludes: [], quarantined:, scenarios:, unsafe:, env_vars: {})
    tests = []
    test_paths.each do |test_path|
      # Add any tests found within given and default folders matching name
      test_globs = Dir.glob([test_path, "#{ENV['GPT_DOCKER_TESTS_DIR'] || ''}/#{test_path}", "#{k6_dir}/#{test_path}", "#{k6_dir}/tests/#{test_path}"])
      test_globs.each do |test_glob|
        tests += Dir.glob(["#{test_glob}.js", "#{test_glob}/*.js", "#{test_glob}/api/*.js", "#{test_glob}/git/*.js", "#{test_glob}/web/*.js"])
        tests += Dir.glob("#{test_glob}/quarantined/*.js") if quarantined
        tests += Dir.glob("#{test_glob}/scenarios/*.js") if scenarios
      end

      # Add any test files given directly if they exist and are of .js type
      tests += Dir.glob("#{File.dirname(test_path)}/#{File.basename(test_path, File.extname(test_path))}.js")
      # Add any tests given by name directly in default folder with or with extension
      tests += Dir.glob("#{k6_dir}/tests/*/#{File.basename(test_path, File.extname(test_path))}.js")
      tests += Dir.glob("#{ENV['GPT_DOCKER_TESTS_DIR']}/*/#{File.basename(test_path, File.extname(test_path))}.js") if ENV['GPT_DOCKER_TESTS_DIR']
    end
    raise "\nNo tests found in specified path(s):\n#{test_paths.join("\n")}\nExiting..." if tests.empty?

    tests = tests.uniq { |path| File.basename(path, '.js') }.sort_by { |path| File.basename(path, '.js') }
    test_excludes&.each do |exclude|
      tests.reject! { |test| test.include? exclude }
    end

    unless env_vars.empty?
      tests.reject! { |test| TestInfo.test_has_unsafe_requests?(test) } unless unsafe
      tests.select! { |test| TestInfo.test_supported_by_gitlab_version?(test, env_vars['ENVIRONMENT_VERSION']) }

      gitlab_settings = GPTCommon.get_env_settings(env_url: env_vars['ENVIRONMENT_URL'], headers: { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] })
      tests.select! { |test| TestInfo.test_supported_by_gitlab_settings?(test, gitlab_settings) }
    end

    tests
  end

  def run_k6(k6_path:, opts:, env_vars:, options_file:, test_file:, results_dir:, gpt_version:)
    test_name = File.basename(test_file, '.js')
    test_summary_report_file = File.join(results_dir, 'test_results', "#{File.basename(test_file, '.js')}.json")
    FileUtils.mkdir_p(File.dirname(test_summary_report_file))

    puts "Running k6 test '#{test_name}' against environment '#{env_vars['ENVIRONMENT_NAME']}'..."

    cmd = [k6_path, 'run']
    cmd += ['--config', options_file] if options_file
    cmd += ['--summary-time-unit', 'ms']
    cmd += ['--summary-export', test_summary_report_file]
    cmd += ['--user-agent', "GPT/#{gpt_version}"]
    cmd += ['--insecure-skip-tls-verify']
    cmd += ['--batch-per-host', '0']
    cmd += ['--http-debug'] if ENV['GPT_DEBUG']
    cmd += ['--out', "influxdb=#{opts[:influxdb_url]}"] if opts[:influxdb_url] && ENV['K6_INFLUXDB_OUTPUT']
    cmd += [test_file]

    status = nil
    output = []
    Open3.popen2e(env_vars, *cmd) do |stdin, stdout_stderr, wait_thr|
      stdin.close
      stdout_stderr.each do |line|
        raise ArgumentError, line.match(/GoError: (.*)"/)[1] if line.match?(/Missing Project Config Data:|Missing Environment Variable:/)

        output << line
        puts line

        status = false if line.match?(/No data generated/)
      end
      status = wait_thr.value.success? if status.nil?
    end

    [status, output]
  end

  def get_test_results(test_file:, status:, output:, test_redo:)
    results = {}

    output.each do |line|
      case line
      when /^\s*script: /
        results["name"] = line.match(/([a-z0-9_]*).js/)[1]
      when /http_req_waiting/
        results["ttfb_avg"] = line.match(/(avg=)(\d+\.\d+)([a-z]+)/)[2]
        results["ttfb_p90"] = line.match(/(p\(90\)=)(\d+\.\d+)([a-z]+)/)[2]
        results["ttfb_p95"] = line.match(/(p\(95\)=)(\d+\.\d+)([a-z]+)/)[2]
      when /vus_max/
        results["rps_target"] = line.match(/max=(\d+)/)[1]
      when /RPS Threshold:/
        results["rps_threshold"] = line.match(/(\d+(\.\d+)?)\/s/)[1]
      when /TTFB P90 Threshold:/
        results["ttfb_p90_threshold"] = line.match(/(\d+)ms/)[1]
      when /http_reqs/
        results["rps_result"] = line.match(/(\d+(\.\d+)?)(\/s)/)[1].to_f.round(2).to_s
      when /Success Rate Threshold/
        results["success_rate_threshold"] = line.match(/(\d+(\.\d+)?)\%/)[1]
      when /successful_requests/
        results["success_rate"] = line.match(/(\d+(\.\d+)?)\%/)[1]
      end
    end

    results["result"] = status
    results["score"] = [results["rps_result"], results["rps_target"], results["success_rate"]].none?(&:nil?) ? ((results["rps_result"].to_f / results["rps_target"].to_f) * results["success_rate"].to_f).round(2) : 0.0
    results['redo'] = test_redo

    results["issues"] = TestInfo.get_test_tag_value(test_file, 'issues')
    results["flags"] = TestInfo.get_test_tag_value(test_file, 'flags')

    results
  end

  def get_results_score(results:, env_vars:)
    scores = results.reject { |result| result['score'].nil? || result['rps_threshold'].to_f < (result['rps_target'].to_f * env_vars['RPS_THRESHOLD_MULTIPLIER'].to_f) }.map { |result| result['score'].to_f }
    return nil if scores.length.zero?

    (scores.sum / scores.length).round(2)
  end

  def generate_results_summary(results_json:)
    results_summary = <<~DOC
      * Environment:                #{results_json['name'].capitalize}
      * Environment Version:        #{results_json['version']} `#{results_json['revision']}`
      * Option:                     #{results_json['option']}
      * Date:                       #{results_json['date']}
      * Run Time:                   #{ChronicDuration.output(results_json['time']['run'], format: :short)} (Start: #{results_json['time']['start']}, End: #{results_json['time']['end']})
      * GPT Version:                v#{results_json['gpt_version']}
    DOC
    results_summary += "\n❯ Overall Results Score: #{results_json['overall_result_score']}%\n" unless results_json['overall_result_score'].nil?
    results_summary
  end

  def generate_results_table(results_json:)
    tp_results = results_json['test_results'].map do |test_result|
      tp_result = {}

      tp_result["Name"] = test_result['name'] || '-'
      tp_result["RPS"] = test_result['rps_target'] ? "#{test_result['rps_target']}/s" : '-'
      tp_result["RPS Result"] = [test_result['rps_result'], test_result['rps_threshold']].none?(&:nil?) ? "#{test_result['rps_result']}/s (>#{test_result['rps_threshold']}/s)" : '-'
      tp_result["TTFB Avg"] = test_result['ttfb_avg'] ? "#{test_result['ttfb_avg']}ms" : '-'
      tp_result["TTFB P90"] = [test_result['ttfb_p90'], test_result['ttfb_p90_threshold']].none?(&:nil?) ? "#{test_result['ttfb_p90']}ms (<#{test_result['ttfb_p90_threshold']}ms)" : '-'
      tp_result["Req Status"] = [test_result['success_rate'], test_result['success_rate_threshold']].none?(&:nil?) ? "#{test_result['success_rate']}% (>#{test_result['success_rate_threshold']}%)" : '-'

      test_result_str = test_result['result'] ? "Passed" : "FAILED"
      test_result_str << '¹' unless test_result['issues'].nil?
      test_result_str << '²' unless test_result['result']
      tp_result["Result"] = test_result['result'] ? Rainbow(test_result_str).green : Rainbow(test_result_str).red

      tp_result
    end

    tp.set(:max_width, 60)
    TablePrint::Printer.table_print(tp_results)
  end

  def generate_results_footer(results_json:)
    footer = ''
    footer << "\n¹ Result covers endpoint(s) that have known issue(s). Threshold(s) have been adjusted to compensate." if results_json['test_results'].any? { |test_result| test_result['issues'] }
    footer << "\n² Failure may not be clear from summary alone. Refer to the individual test's full output for further debugging." unless results_json['overall_result']
    footer
  end
end
