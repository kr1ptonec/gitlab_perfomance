$LOAD_PATH.unshift File.expand_path('.', __dir__)

require 'cgi'
require 'chronic_duration'
require 'gpt_common'
require 'rainbow'
require 'time'
require 'uri'

class ImportProject
  ProjectImportError = Class.new(StandardError)

  def initialize(env_url:, project_tarball:)
    @env_url = env_url.chomp('/')
    @env_api_url = URI.join(@env_url + '/', "api/v4")
    @headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    @project_tarball = project_tarball
  end

  def setup_tarball(project_tarball:)
    # Check that the tarball file is valid

    if project_tarball.match?(URI::DEFAULT_PARSER.make_regexp(%w[http https ftp]))
      GPTLogger.logger.info "Tarball is remote, downloading..."
      proj_file = GPTCommon.download_file(url: project_tarball)
    else
      proj_file = project_tarball
    end

    raise Errno::ENOENT unless File.exist?(proj_file)

    proj_file
  end

  def setup_group(namespace:)
    return unless namespace && !GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/namespaces/#{CGI.escape(namespace)}", headers: @headers, fail_on_error: false).status.success?

    GPTLogger.logger.info "Creating group #{namespace}..."
    grp_url = "#{@env_api_url}/groups"
    grp_params = {
      name: namespace,
      path: namespace,
      visibility: 'public'
    }
    GPTCommon.make_http_request(method: 'post', url: grp_url, params: grp_params, headers: @headers)
  end

  def import_project_request(proj_tarball_file:, project_name:, namespace:, storage_name:, project_description:)
    GPTLogger.logger.info "Importing project #{project_name}...\nNote that this may take some time to upload a file to the target environment."
    GPTLogger.logger.info Rainbow("If project import takes more than an hour please refer to the troubleshooting docs https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#import-looks-to-have-hanged.\nStart time: #{Time.now.strftime('%H:%M:%S %Y-%m-%d %Z')}").blue
    proj_url = "#{@env_api_url}/projects/import"
    proj_params = {
      file: HTTP::FormData::File.new(proj_tarball_file),
      namespace: namespace,
      path: project_name,
      'override_params[repository_storage]': storage_name
    }
    proj_params['override_params[description]'] = project_description unless project_description.nil?
    # we need to enable chunked transfers so Cloudflare won't reject uploads > 100MB
    upload_headers = {
      'Transfer-Encoding': 'chunked'
    }.merge(@headers)
    GPTLogger.logger.info "Uploading project tarball to the target environment Import API..."
    proj_res = GPTCommon.make_http_request(method: 'post', url: proj_url, params: proj_params, headers: upload_headers, fail_on_error: false)
    raise ProjectImportError, "Project import request has failed with the following error:\nCode: #{proj_res.code}\nResponse: #{proj_res.body}\nThis is very likely to be an issue with the target environment. To troubleshoot please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#import-has-failed\n" unless proj_res.status.success?

    proj_id = JSON.parse(proj_res.body.to_s)['id']

    GPTLogger.logger.info "\nProject tarball has successfully uploaded and started to be imported with ID '#{proj_id}'"
    proj_id
  end

  def wait_for_import(proj_id:, start_time:)
    print "Waiting until Project '#{proj_id}' has imported successfully..."
    loop do
      proj_imp_res = JSON.parse(GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/projects/#{proj_id}/import", headers: @headers).body.to_s)

      case proj_imp_res['import_status']
      when 'finished'
        time_taken = ChronicDuration.output(Time.now.to_i - start_time, format: :long, keep_zero: true)
        GPTLogger.logger.info(Rainbow("\nProject has successfully imported in #{time_taken}:\n#{@env_url}/#{proj_imp_res['path_with_namespace']}").green)
        break
      when 'failed'
        raise ProjectImportError, "Project has failed to import.\nGitLab import error:\n #{proj_imp_res['import_error']}\nCorrelation ID: #{proj_imp_res['correlation_id']}\nThis is very likely to be an issue with the target environment. To troubleshoot please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#import-has-failed"
      when 'scheduled', 'started'
        print '.'
        sleep 5
      else
        sleep 5
      end
    end
  end

  def remove_prev_project(proj_id:)
    # Import cleanup: remove the project
    GPTLogger.logger.info "Removing previously imported project"
    project_url = "#{@env_api_url}/projects/#{proj_id}"
    GPTCommon.make_http_request(method: 'delete', url: project_url, headers: @headers)
    GPTLogger.logger.info "The project was removed"
  end

  def import_project(proj_tarball_file:, project_name:, namespace:, storage_name:, project_description: nil, with_cleanup:)
    GPTLogger.logger.info(Rainbow("Starting import of Project '#{project_name}' from tarball '#{@project_tarball}'" + (namespace ? " under namespace '#{namespace}'" : '') + " to GitLab environment '#{@env_url}'\n").color(230, 83, 40))

    GPTCommon.check_gitlab_env_and_token(env_url: @env_url)
    setup_group(namespace: namespace)
    start_time = Time.now.to_i

    begin
      proj_id = import_project_request(proj_tarball_file: proj_tarball_file, project_name: project_name, namespace: namespace, storage_name: storage_name, project_description: project_description)
      wait_for_import(proj_id: proj_id, start_time: start_time)
    ensure
      remove_prev_project(proj_id: proj_id) if with_cleanup
    end
  end
end
