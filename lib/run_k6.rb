require 'chronic_duration'
require 'down/http'
require 'fileutils'
require 'http'
require 'json'
require 'open3'
require 'os'
require 'rainbow'
require 'table_print'
require 'tmpdir'

module RunK6
  def self.setup_k6
    k6_version = ENV['K6_VERSION'] || '0.25.1'

    ['k6', File.join(Dir.tmpdir, 'k6')].each do |k6|
      return k6 if Open3.capture2e("#{k6} version" + ';')[0].strip == "k6 v#{k6_version}"
    end

    if OS.linux?
      k6_url = ENV['K6_URL'] || "https://github.com/loadimpact/k6/releases/download/v#{k6_version}/k6-v#{k6_version}-linux#{OS.bits}.tar.gz"
      warn Rainbow("k6 not found or different version detected. Downloading k6 v#{k6_version} from #{k6_url} to system temp folder...").yellow

      k6_archive = Down::Http.download(k6_url)
      extract_output, extract_status = Open3.capture2e('tar', '-xzvf', k6_archive.path, '-C', File.dirname(k6_archive.path), '--strip-components', '1')
      raise "k6 archive extract failed:\b#{extract_output}" unless extract_status
    elsif OS.mac?
      k6_url = ENV['K6_URL'] || "https://github.com/loadimpact/k6/releases/download/v#{k6_version}/k6-v#{k6_version}-mac.zip"
      warn Rainbow("k6 not found or wrong version detected. Downloading k6 version #{k6_version} from #{k6_url} to system temp folder...").yellow

      k6_archive = Down::Http.download(k6_url)
      extract_output, extract_status = Open3.capture2e('unzip', '-j', k6_archive.path, '-d', File.dirname(k6_archive.path))
      raise "k6 archive extract failed:\b#{extract_output}" unless extract_status
    elsif OS.windows?
      raise "k6 not found or wrong version detected. Please install k6 version #{k6_version} on your machine and ensure it's found on the PATH"
    end

    File.join(File.dirname(k6_archive.path), 'k6')
  end

  def self.setup_env_vars(env_file:, options_file:)
    env_vars = {}
    env_file_vars = JSON.parse(File.read(env_file))

    env_vars['ENVIRONMENT_NAME'] = ENV['ENVIRONMENT_NAME'].dup || env_file_vars['environment']['name']
    env_vars['ENVIRONMENT_URL'] = (ENV['ENVIRONMENT_URL'].dup || env_file_vars['environment']['url']).chomp('/')

    options_file_vars = JSON.parse(File.read(options_file))
    env_vars['OPTION_RPS'] = options_file_vars['rps'].to_s
    env_vars['OPTION_RPS_COUNT'] ||= begin
      duration = options_file_vars['stages'].inject(0.0) { |sum, n| sum + n['duration'].delete('a-z').to_f }
      (duration * options_file_vars['rps'].to_f).to_i.to_s
    end
    env_vars['OPTION_STAGES'] = options_file_vars['stages'].to_json

    env_vars['SUCCESS_RATE_THRESHOLD'] ||= '0.95'
    env_vars['GIT_ENDPOINT_THRESHOLD'] ||= '0.1'
    env_vars['WEB_ENDPOINT_THRESHOLD'] ||= '0.1'

    env_vars
  end

  def self.get_env_version(env_vars:)
    res = HTTP.headers('PRIVATE-TOKEN': ENV['ACCESS_TOKEN']).get("#{env_vars['ENVIRONMENT_URL']}/api/v4/version")
    version = JSON.parse(res.body.to_s).values.join(' ')
    version == '401 Unauthorized' ? nil : version
  end

  def self.get_tests(test_paths:, quarantined:, scenarios:, custom:)
    tests = []
    test_paths.each do |test|
      if File.directory?(test)
        tests += Dir.glob("#{test}/api/*.js")
        tests += Dir.glob("#{test}/git/*.js")
        tests += Dir.glob("#{test}/web/*.js")
        tests += Dir.glob("#{test}/quarantined/*.js") if quarantined
        tests += Dir.glob("#{test}/scenarios/*.js") if scenarios
        tests += Dir.glob("#{test}/custom/*.js") if custom
      elsif File.file?(test)
        tests << test
      end
    end
    raise "\nNo tests found in specified path(s):\n#{test_paths.join("\n")}\nExiting..." if tests.empty?

    tests.uniq.sort_by { |path| File.basename(path, '.js') }
  end

  def self.run_k6(k6_path:, env_vars:, options_file:, test_file:, http_debug:)
    test_name = File.basename(test_file, '.js')
    puts "Running k6 test '#{test_name}' against environment '#{env_vars['ENVIRONMENT_NAME']}'..."

    cmd = [k6_path, 'run']
    cmd += ['--config', options_file] if options_file
    cmd += ['--summary-time-unit', 'ms']
    cmd += ['--http-debug'] if http_debug
    cmd += [test_file]

    status = nil
    output = []
    Open3.popen2e(env_vars, *cmd) do |stdin, stdout_stderr, wait_thr|
      stdin.close
      stdout_stderr.each do |line|
        raise ArgumentError, "Test '#{test_name}' requires environment variable ACCESS_TOKEN to be set. Skipping...\n" if line =~ /(GoError:).*(ACCESS_TOKEN)/
        raise "No requests completed in time by the end of the test. This is likely due to no responses being received from the server.\n" if line =~ /No data generated/

        output << line.lstrip
        puts line
      end
      status = wait_thr.value
    end

    [status.success?, output]
  end

  def self.parse_k6_results(output:)
    results = []
    matches = {}

    output.each do |line|
      case line
      when /http_req_duration/
        matches[:p95] = line.match(/(p\(95\)=)(\d+\.\d+)([a-z]+)/)
      when /vus_max/
        matches[:rps_target] = line.match(/max=(\d+)/)
      when /RPS Threshold/
        matches[:rps_threshold] = line.match(/\d+\.\d+\/s/)
      when /http_reqs/
        matches[:rps] = line.match(/(\d+\.\d+)(\/s)/)
      when /Success Rate Threshold/
        matches[:success_rate_threshold] = line.match(/\d+(\.\d+)?\%/)
      when /successful_requests/
        matches[:success_rate] = line.match(/\d+(\.\d+)?\%/)
      end
    end

    results.insert(0, [:RPS, "#{matches[:rps_target][1]}/s"])
    results.insert(1, [:'RPS Result', "#{matches[:rps][1].to_f.round(2)}#{matches[:rps][2]} (>#{matches[:rps_threshold][0]})"])
    results.insert(2, [:'Response P95', matches[:p95][2] + matches[:p95][3]])
    results.insert(3, [:'Request Results', "#{matches[:success_rate][0]} (>#{matches[:success_rate_threshold][0]})"])

    results.compact.to_h
  end
end
