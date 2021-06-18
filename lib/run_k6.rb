$LOAD_PATH.unshift File.expand_path('.', __dir__)

require 'chronic_duration'
require 'test_info'
require 'fileutils'
require 'gpt_common'
require 'json'
require 'open3'
require 'os'
require 'gpt_prepare_test_data'
require 'rainbow'
require 'tmpdir'

module RunK6
  extend self

  def setup_k6
    k6_version = ENV['K6_VERSION'] || '0.32.0'

    ['k6', File.join(Dir.tmpdir, 'k6')].each do |k6|
      return k6 if Open3.capture2e("#{k6} version" + ';')[0].strip.match?(/^k6 v#{k6_version}/)
    end

    raise "CPU type #{OS.host_cpu} is unsupported. Supported CPU types are x86 or Arm (64 bit)." unless OS.host_cpu.match?(/x86_64|aarch64|arm/)

    cpu_arch = OS.host_cpu == 'aarch64' ? 'arm64' : 'amd64'
    if OS.linux?
      k6_url = ENV['K6_URL'] || "https://github.com/k6io/k6/releases/download/v#{k6_version}/k6-v#{k6_version}-linux-#{cpu_arch}.tar.gz"
      warn Rainbow("k6 not found or different version detected. Downloading k6 v#{k6_version} from #{k6_url} to system temp folder...").yellow

      k6_archive = GPTCommon.download_file(url: k6_url)
      extract_output, extract_status = Open3.capture2e('tar', '-xzvf', k6_archive.path, '-C', File.dirname(k6_archive.path), '--strip-components', '1')
      raise "k6 archive extract failed:\b#{extract_output}" unless extract_status.success?
    elsif OS.mac?
      k6_url = ENV['K6_URL'] || "https://github.com/k6io/k6/releases/download/v#{k6_version}/k6-v#{k6_version}-macos-#{cpu_arch}.zip"
      warn Rainbow("k6 not found or wrong version detected. Downloading k6 version #{k6_version} from #{k6_url} to system temp folder...").yellow

      k6_archive = GPTCommon.download_file(url: k6_url)
      extract_output, extract_status = Open3.capture2e('unzip', '-j', '-o', k6_archive.path, '-d', File.dirname(k6_archive.path))
      raise "k6 archive extract failed:\b#{extract_output}" unless extract_status.success?
    end

    File.join(File.dirname(k6_archive.path), 'k6')
  end

  def get_env_version(env_url:)
    headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    res = GPTCommon.make_http_request(method: 'get', url: "#{env_url}/api/v4/version", headers: headers, fail_on_error: false)
    res.status.success? ? JSON.parse(res.body.to_s) : { "version" => "-", "revision" => "-" }
  end

  def get_options_env_vars(options_file:)
    options_env_vars = {}
    options_file_vars = JSON.parse(File.read(options_file))

    options_env_vars['OPTION_RPS'] = options_file_vars['rps'].to_s
    options_env_vars['OPTION_RPS_COUNT'] = begin
      duration = options_file_vars['stages'].inject(0.0) { |sum, n| sum + n['duration'].delete('a-z').to_f }
      (duration * options_file_vars['rps'].to_f).to_i.to_s
    end
    options_env_vars['OPTION_STAGES'] = options_file_vars['stages'].to_json

    options_env_vars
  end

  def setup_env_file_vars(k6_dir:, env_file:)
    env_vars = {}
    env_file_vars = JSON.parse(File.read(env_file))

    env_vars['ENVIRONMENT_NAME'] = ENV['ENVIRONMENT_NAME'].dup || env_file_vars['environment']['name']
    env_vars['ENVIRONMENT_URL'] = (ENV['ENVIRONMENT_URL'].dup || env_file_vars['environment']['url']).chomp('/')
    env_vars['ENVIRONMENT_USER'] = ENV['ENVIRONMENT_USER'].dup || env_file_vars['environment']['user']
    env_vars['ENVIRONMENT_LATENCY'] = ENV['ENVIRONMENT_LATENCY'].dup || env_file_vars['environment'].dig('config', 'latency')
    env_vars['ENVIRONMENT_ROOT_GROUP'] = env_file_vars['gpt_data']['root_group']
    env_vars['ENVIRONMENT_LARGE_PROJECTS'] = GPTPrepareTestData.prepare_vertical_json_data(k6_dir: k6_dir, env_file_vars: env_file_vars)
    env_vars['ENVIRONMENT_MANY_GROUPS_AND_PROJECTS'] = GPTPrepareTestData.prepare_horizontal_json_data(env_file_vars: env_file_vars)
    env_vars['GPT_LARGE_PROJECT_CHECK_SKIP'] = env_file_vars['gpt_data']['skip_check_version']
    env_vars
  end

  def setup_env_vars(k6_dir:, env_file:, options_file:)
    env_vars = setup_env_file_vars(k6_dir: k6_dir, env_file: env_file)

    env_vars['RPS_THRESHOLD_MULTIPLIER'] = ENV['RPS_THRESHOLD_MULTIPLIER'].dup || '0.8'
    env_vars['SUCCESS_RATE_THRESHOLD'] = ENV['SUCCESS_RATE_THRESHOLD'].dup || '0.99'
    env_vars['TTFB_THRESHOLD'] = ENV['TTFB_THRESHOLD'].dup || '500'

    env_vars['GIT_PULL_ENDPOINT_THROUGHPUT'] = ENV['GIT_PULL_ENDPOINT_THROUGHPUT'].dup || '0.1'
    env_vars['GIT_PUSH_ENDPOINT_THROUGHPUT'] = ENV['GIT_PUSH_ENDPOINT_THROUGHPUT'].dup || '0.02'
    env_vars['WEB_ENDPOINT_THROUGHPUT'] = ENV['WEB_ENDPOINT_THROUGHPUT'].dup || '0.1'
    env_vars['SCENARIO_ENDPOINT_THROUGHPUT'] = ENV['SCENARIO_ENDPOINT_THROUGHPUT'].dup || '0.01'

    env_vars['K6_SETUP_TIMEOUT'] = ENV['K6_SETUP_TIMEOUT'].dup || '60s'
    env_vars['K6_TEARDOWN_TIMEOUT'] = ENV['K6_TEARDOWN_TIMEOUT'].dup || '60s'

    env_version = get_env_version(env_url: env_vars['ENVIRONMENT_URL'])
    env_vars['ENVIRONMENT_VERSION'] = env_version['version']
    env_vars['ENVIRONMENT_REVISION'] = env_version['revision']

    options_env_vars = get_options_env_vars(options_file: options_file)
    env_vars.merge!(options_env_vars)

    env_vars
  end

  def check_large_projects_visibility(env_vars:)
    large_projects = JSON.parse(env_vars['ENVIRONMENT_LARGE_PROJECTS'])
    large_projects.each do |large_project|
      large_project_res = GPTCommon.make_http_request(method: 'get', url: "#{env_vars['ENVIRONMENT_URL']}/#{large_project['unencoded_path']}", headers: { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] })
      raise "\nPlease ensure that Large Project '#{large_project['unencoded_path']}' exists and has Public visibility.\nFor more info please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/k6.md#tests-failing-due-to-sign-in-page-redirect\nExiting..." if large_project_res.uri.to_s.include?("users/sign_in")
    end
  end

  def prepare_tests(tests:, env_vars:)
    # Prepare specific test data
    GPTPrepareTestData.prepare_git_push_data(env_vars: env_vars) unless tests.grep(/git_push/).empty? || env_vars.empty?
  end

  def get_tests(k6_dir:, test_paths:, quarantined:, scenarios:, unsafe:, test_excludes: [], env_vars: {})
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

    tests.reject! { |test| TestInfo.test_has_unsafe_requests?(test) } unless unsafe
    filter_tests(tests: tests, env_vars: env_vars)
  end

  def filter_tests(tests:, env_vars:)
    return tests if env_vars.empty?

    tests.select! { |test| TestInfo.test_supported_by_gitlab_version?(test, env_vars['ENVIRONMENT_VERSION']) }

    gitlab_settings = GPTCommon.get_env_settings(env_url: env_vars['ENVIRONMENT_URL'], headers: { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] })
    tests.select! { |test| TestInfo.test_supported_by_gitlab_settings?(test, gitlab_settings) }

    large_project_data = JSON.parse(env_vars['ENVIRONMENT_LARGE_PROJECTS']).first
    begin
      large_project_res = GPTCommon.make_http_request(method: 'get', url: "#{env_vars['ENVIRONMENT_URL']}/api/v4/projects/#{large_project_data['encoded_path']}", headers: { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }, fail_on_error: true)
      large_project_description = JSON.parse(large_project_res.body.to_s)['description']
      gpt_data_version = large_project_description.match?(/Version: (.*)/) ? large_project_description.match(/Version: (.*)/)[1] : '-'
    rescue GPTCommon::RequestError => e
      raise "\nLarge Project request has failed with the error:\n#{e}\nPlease ensure that Large Project exists at this location '#{large_project_data['unencoded_path']}'\nExiting..."
    rescue TypeError, NoMethodError
      raise "\nLarge Project's description can't be parsed.\nPlease check if there are any problems with the target environment. If the environment is confirmed working but the problem persists, please run the GPT Data Generator to reimport the Large Project.\nExiting..."
    end
    tests.select! { |test| TestInfo.test_supported_by_gpt_data?(test, gpt_data_version) } unless env_vars['GPT_LARGE_PROJECT_CHECK_SKIP'] == 'true'

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
    cmd += ['--summary-trend-stats', 'avg,min,med,max,p(90),p(95)']
    cmd += ['--user-agent', "GPT/#{gpt_version}"]
    cmd += ['--insecure-skip-tls-verify']
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

        status = false if line.include?('No data generated')
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
        results["rps_threshold"] = line.match(/(\d+\.\d+)\/s/)[1]
      when /TTFB P90 Threshold:/
        results["ttfb_p90_threshold"] = line.match(/(\d+)ms/)[1]
      when /http_reqs/
        results["rps_result"] = line.match(/(\d+(\.\d+)?)(\/s)/)[1].to_f.round(2).to_s
      when /Success Rate Threshold/
        results["success_rate_threshold"] = line.match(/(\d+(\.\d+)?)%/)[1]
      when /successful_requests/
        results["success_rate"] = line.match(/(\d+(\.\d+)?)%/)[1]
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
end
