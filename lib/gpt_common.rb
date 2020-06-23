require 'http'
require 'json'
require 'gpt_logger'
require 'semantic'

module GPTCommon
  extend self

  RequestError = Class.new(StandardError)

  def make_http_request(method: 'get', url: nil, params: {}, headers: {}, body: "", show_response: false, fail_on_error: true)
    raise "URL not defined for making request. Exiting..." unless url

    ctx = OpenSSL::SSL::SSLContext.new
    ctx.verify_mode = OpenSSL::SSL::VERIFY_NONE

    res = body.empty? ? HTTP.follow.method(method).call(url, form: params, headers: headers, ssl_context: ctx) : HTTP.follow.method(method).call(url, body: body, headers: headers, ssl_context: ctx)

    if show_response
      res_body =
        if res.content_type.mime_type == "application/json"
          JSON.parse(res.body.to_s)
        else
          res.body.to_s
        end
      GPTLogger.logger.info(res_body)
    end

    raise RequestError, "#{method.upcase} request failed!\nCode: #{res.code}\nResponse: #{res.body}\n" if fail_on_error && !res.status.success?

    res
  end

  def check_gitlab_env_and_token(env_url:)
    # Check that environment can be reached and that token is valid
    GPTLogger.logger.info "Checking that GitLab environment '#{env_url}' is available, supported and that provided Access Token works..."
    check_res = make_http_request(method: 'get', url: "#{env_url}/api/v4/version", headers: { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }, fail_on_error: false)
    raise "Environment access token check has failed:\n#{check_res.status} - #{JSON.parse(check_res.body.to_s)}" if check_res.status.client_error? || check_res.status.server_error?

    gitlab_version = Semantic::Version.new(JSON.parse(check_res.body.to_s)['version'])
    warn Rainbow("\nEnvironment version check has failed: Minimum supported GitLab version is 12.5.0, target environment is #{gitlab_version}. For older versions please refer to the docs for more info - https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/environment_prep.md#environment-requirements\n").red if gitlab_version < Semantic::Version.new('12.5.0')
    raise "\nEnvironment version check has failed: GitLab versions lower than 11.0.0 are unsupported, target environment is #{gitlab_version}. Exiting..." if gitlab_version < Semantic::Version.new('11.0.0')

    version = JSON.parse(check_res.body.to_s).values.join(' ')
    GPTLogger.logger.info "Environment and Access Token check complete - URL: #{env_url}, Version: #{version}\n"
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
  end

  def show_warning_prompt(warn_text)
    puts Rainbow("#{warn_text}\nDo you want to proceed? [Y/N]").yellow
    prompt = STDIN.gets.chomp
    abort(Rainbow('Aborted.').green) unless prompt.match?(/y(?:es)?|1/i)
  end
end
