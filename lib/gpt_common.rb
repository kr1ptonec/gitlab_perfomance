require 'down'
require 'http'
require 'json'
require 'gpt_logger'
require 'semantic'

module GPTCommon
  extend self

  RequestError = Class.new(StandardError)
  BadGatewayError = Class.new(StandardError)

  def make_http_request(method: 'get', url: nil, params: {}, headers: {}, body: "", show_response: false, fail_on_error: true, retry_on_error: false)
    raise "URL not defined for making request. Exiting..." unless url

    ctx = OpenSSL::SSL::SSLContext.new
    ctx.verify_mode = OpenSSL::SSL::VERIFY_NONE

    begin
      retries ||= 0
      res = body.empty? ? HTTP.follow.method(method).call(url, form: params, headers: headers, ssl_context: ctx) : HTTP.follow.method(method).call(url, body: body, headers: headers, ssl_context: ctx)

      if show_response
        res_body = res.content_type.mime_type == "application/json" ? JSON.parse(res.body.to_s) : res.body.to_s
        GPTLogger.logger.info(res_body)
      end

      raise BadGatewayError, "#{method.upcase} request failed!\nURL: #{url}\nCode: #{res.code}\nResponse: #{res.body}\n" if res.status == 502 && fail_on_error
    rescue BadGatewayError => e
      # Retry to send request once, if response was 502
      retries += 1
      raise e if retries > 1 || retry_on_error == false

      GPTLogger.logger.info("Retrying request in 5 seconds...")
      sleep 5
      retry
    end

    if fail_on_error && !res.status.success?
      error_message = "#{method.upcase} request failed!\nCode: #{res.code}\nResponse: #{res.body}\n"
      correlation_id = res.headers.to_hash.transform_keys(&:downcase)['x-request-id']
      error_message = "#{error_message}Correlation ID: #{correlation_id}\n" unless correlation_id.nil?
      raise RequestError, error_message
    end

    res
  end

  def download_file(url:)
    ENV['PROXY_URL'] ? Down.download(url, proxy: ENV['PROXY_URL']) : Down.download(url)
  rescue Down::TimeoutError => e
    raise e, "File download from url '#{url}' has timed out.\nIf the machine you are running this tool on doesn't have internet access please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#airgapped-environments for further info."
  rescue Down::Error => e
    raise e, "File download from url '#{url}' with the following error: #{e.exception}"
  end

  def check_gitlab_env_and_token(env_url:)
    # Check that environment can be reached and that token is valid
    GPTLogger.logger.info "Checking that GitLab environment '#{env_url}' is available, supported and that provided Access Token works..."
    check_res = make_http_request(method: 'get', url: "#{env_url}/api/v4/version", headers: { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }, fail_on_error: false)
    raise "Environment access token check has failed:\n#{check_res.status} - #{JSON.parse(check_res.body.to_s)}" if check_res.status.client_error? || check_res.status.server_error?

    gitlab_version = Semantic::Version.new(JSON.parse(check_res.body.to_s)['version'])
    warn Rainbow("\nTarget environment is #{gitlab_version}. Minimum fully supported GitLab version for GPT is 12.5.0. For versions between 11.0.0 and 12.5.0 your mileage may vary, please refer to the docs for more info - https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#environment-requirements\n").yellow if gitlab_version < Semantic::Version.new('12.5.0')
    raise "\nTarget environment is #{gitlab_version}. GitLab versions lower than 11.0.0 are unsupported, please refer to the docs for more info - https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#environment-requirements. Exiting..." if gitlab_version < Semantic::Version.new('11.0.0')

    version = JSON.parse(check_res.body.to_s).values.join(' ')
    GPTLogger.logger.info "Environment and Access Token check complete - URL: #{env_url}, Version: #{version}\n"
    gitlab_version
  end

  def get_env_settings(env_url:, headers:)
    return false unless ENV['ACCESS_TOKEN']

    res = GPTCommon.make_http_request(method: 'get', url: "#{env_url}/api/v4/application/settings", headers: headers, fail_on_error: false)
    res.status.success? ? JSON.parse(res.body.to_s) : {}
  end

  def change_env_settings(env_url:, headers:, settings:)
    GPTLogger.logger.info "Updating application settings: #{settings}"
    res = GPTCommon.make_http_request(method: 'put', url: "#{env_url}/api/v4/application/settings", params: settings, headers: headers, fail_on_error: false)
    raise "Request has failed:\n#{res.status} - #{JSON.parse(res.body.to_s)}\nPlease ensure admin ACCESS_TOKEN is used." if res.status.client_error? || res.status.server_error?

    sleep 1 # Wait for a setting change to propagate
  end

  def get_license_details(env_url:, headers:)
    return false unless ENV['ACCESS_TOKEN']

    res = GPTCommon.make_http_request(method: 'get', url: "#{env_url}/api/v4/license", headers: headers, fail_on_error: false)
    res.status.success? ? JSON.parse(res.body.to_s) : {} # returns nil if no license found ie., free tier
  end

  def show_warning_prompt(warn_text)
    puts Rainbow("#{warn_text}\nDo you want to proceed? [Y/N]").yellow
    prompt = $stdin.gets.chomp
    abort(Rainbow('Aborted.').green) unless prompt.match?(/y(?:es)?|1/i)
  end
end
