$LOAD_PATH.unshift File.expand_path('.', __dir__)

require 'cgi'
require 'connection_pool'
require 'gpt_common'
require 'gpt_graphql'
require 'http'
require 'import_project'
require 'rainbow'
require 'ruby-progressbar'
require 'tty-spinner'
require 'uri'

class GPTTestData
  attr_reader :root_group, :large_projects_validation_errors

  WaitForDeleteError = Class.new(StandardError)
  IncorrectProjectDataError = Class.new(StandardError)
  ProjectCheckError = Class.new(StandardError)
  GroupCheckError = Class.new(StandardError)
  VulnerabilitiesCountError = Class.new(StandardError)

  def initialize(gpt_data_version:, unattended:, env_url:, storage_nodes:, max_wait_for_delete:, skip_project_validation:)
    @gpt_data_version_description = "Generated and maintained by GPT Data Generator v#{gpt_data_version}"
    @unattended = unattended
    @skip_project_validation = skip_project_validation
    @env_url = env_url.chomp('/')
    @env_api_url = URI.join(@env_url + '/', "api/v4")
    @headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    @max_wait_for_delete = max_wait_for_delete
    @storage_nodes = storage_nodes

    @gitlab_version = GPTCommon.check_gitlab_env_and_token(env_url: @env_url)
    @settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    @license = GPTCommon.get_license_details(env_url: @env_url, headers: @headers)
    @large_projects_validation_errors = {}

    @default_pool_size = ENV['GPT_GENERATOR_POOL_SIZE'].nil? ? 10 : ENV['GPT_GENERATOR_POOL_SIZE'].to_i
    @default_pool_timeout = ENV['GPT_GENERATOR_POOL_TIMEOUT'].nil? ? 60 : ENV['GPT_GENERATOR_POOL_TIMEOUT'].to_i
    @default_retry_count = ENV['GPT_GENERATOR_RETRY_COUNT'].nil? ? 10 : ENV['GPT_GENERATOR_POOL_TIMEOUT'].to_i
    @default_retry_wait = ENV['GPT_GENERATOR_RETRY_WAIT'].nil? ? 1 : ENV['GPT_GENERATOR_POOL_TIMEOUT'].to_i
    Thread.report_on_exception = false
  end

  # Shared

  def wait_for_delete(entity_endpoint:)
    start = Time.new
    loop do
      elapsed = (Time.new - start).to_i
      raise WaitForDeleteError, "Waiting failed after #{elapsed} seconds. Consider increasing `--max-wait-for-delete` option. Exiting..." if elapsed >= @max_wait_for_delete

      check_deleted_entity = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/#{entity_endpoint}", headers: @headers, fail_on_error: false, retry_on_error: true)

      if !JSON.parse(check_deleted_entity.body.to_s)&.dig('marked_for_deletion_on').nil?
        GPTLogger.logger.warn Rainbow("Delete request successfully scheduled. It will be removed after the time as defined by the environment's deletion delay settings. \nFor more info please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#group-or-project-is-marked-for-deletion").yellow
        break
      elsif check_deleted_entity.status.code == 404
        GPTLogger.logger(only_to_file: true).info "Delete successful"
        break
      end

      raise WaitForDeleteError, "Delete request failed!\nCode: #{check_deleted_entity.code}\nResponse: #{check_deleted_entity.body}\n" if check_deleted_entity.status.to_s.match?(/5\d{2}$/)

      sleep 1
    end
  end

  # Settings

  def check_setting_available?(setting:)
    @settings.key?(setting)
  end

  # check enterprise license

  def check_gitlab_ultimate?
    return false if @license.nil?

    @license['plan'].downcase.include?('ultimate')
  end

  ## Soft Delete

  def disable_soft_delete_settings
    # Deletion adjourned period is only available for GitLab Premium or Ultimate
    # For other tiers settings won't have 'deletion_adjourned_period' / `delayed_project_deletion`
    delayed_deletion_settings = @gitlab_version >= Semantic::Version.new('15.3.0') ? { 'delayed_project_deletion' => false, 'delayed_group_deletion' => false } : { 'deletion_adjourned_period' => 0 }

    delayed_deletion_settings.each do |setting, value|
      break if !check_setting_available?(setting: setting) || @settings[setting] == value

      # Disable soft delete only for the first time
      current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
      break if current_settings[setting] == value

      # Workaround until Project API supports immediate deletion https://gitlab.com/gitlab-org/gitlab/-/issues/371541
      GPTCommon.show_warning_prompt("GPT Data Generator will update the GitLab Environment '#{setting}' setting to disable soft-delete.\n\nWhile the GPT Data Generator is running this setting change will be in effect.\nThe original setting will be restored at the end of data generation.") unless @unattended
      GPTLogger.logger.info "Disabling soft-delete by updating '#{setting}' to '#{value}'..."
      GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { setting => value })
    end
  end

  def restore_soft_delete_settings
    current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    delayed_deletion_settings = @gitlab_version >= Semantic::Version.new('15.3.0') ? %w[delayed_group_deletion delayed_project_deletion] : ['deletion_adjourned_period']
    delayed_deletion_settings.each do |setting|
      break if !check_setting_available?(setting: setting) || current_settings[setting] == @settings[setting]

      GPTLogger.logger.info "Restoring the original '#{setting}' setting..."
      GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { setting => @settings[setting] })
    end
  end

  ## Storage

  def check_repo_storage_settings_type
    # Check that the fix https://gitlab.com/gitlab-org/gitlab/-/merge_requests/36376 is
    # available on a target environment and we can change `repository_storages_weighted` via API.
    # This is an additional safeguard in case env is on 13.2-pre versions where the fix is in place after `13.2.0-pre a3ee515ecc`
    return if check_setting_available?(setting: 'repository_storages_weighted') || @gitlab_version < Semantic::Version.new('13.1.0') || @gitlab_version > Semantic::Version.new('13.2.2')

    abort(Rainbow("Target GitLab environment v#{@gitlab_version} is affected by an issue that prevents Repository Storage settings changes via API.\nDue to this we recommend you update the environment to version '13.2.2' or higher to proceed or import large projects manually.\nTo learn more please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#repository-storages-config-cant-be-updated-via-application-settings-api.\n").yellow)
  end

  def compare_repo_storage_settings(setting:)
    current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)

    if current_settings.key?('repository_storages_weighted')
      setting = setting.product([100]).to_h if setting.is_a?(Array)
      current_settings['repository_storages_weighted'] == setting
    else
      current_settings['repository_storages'] == setting
    end
  end

  def generate_repo_storage_settings_payload(storages:)
    repo_storage_settings_payload = {}

    if check_setting_available?(setting: 'repository_storages_weighted')
      # (GitLab 13.1 and later) Hash of names of enabled storage paths with weights.
      # New projects are created in one of these stores, chosen by a weighted random selection.
      # https://docs.gitlab.com/ee/administration/repository_storage_paths.html#choose-where-new-repositories-will-be-stored
      storages = storages.product([100]).to_h if storages.is_a?(Array)

      storages.each { |storage, weight| repo_storage_settings_payload["repository_storages_weighted[#{storage}]"] = weight }
    else
      # (GitLab 13.0 and earlier) List of names of enabled storage paths.
      # New projects are created in one of these stores, chosen at random.
      repo_storage_settings_payload = { 'repository_storages[]': storages }
    end

    repo_storage_settings_payload
  end

  def configure_repo_storage_settings(storage:)
    storage = [storage] if storage.is_a?(String)
    return if compare_repo_storage_settings(setting: storage)

    repo_storage_settings_payload = generate_repo_storage_settings_payload(storages: storage)
    GPTLogger.logger.info "Updating GitLab Application Repository Storage setting"
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: repo_storage_settings_payload)
  end

  def restore_repo_storage_settings
    repo_storage_settings = check_setting_available?(setting: 'repository_storages_weighted') ? @settings['repository_storages_weighted'] : @settings['repository_storages']
    return if repo_storage_settings.nil? || compare_repo_storage_settings(setting: repo_storage_settings)

    repo_storage_settings_payload = generate_repo_storage_settings_payload(storages: repo_storage_settings)
    GPTLogger.logger.info "Restoring the original Repository Storage setting in GitLab Application."
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: repo_storage_settings_payload)
  end

  ## Max Import Size

  def disable_max_import_size_setting
    return if check_setting_available?(setting: 'max_import_size') == false || @settings['max_import_size'] == 10240

    GPTCommon.show_warning_prompt("GPT Data Generator will disable the GitLab Environment 'max_import_size' setting to allow for large project imports.\nWhile the GPT Data Generator is running this setting change will be in effect.\nThe original setting will be restored at the end of data generation.") unless @unattended
    GPTLogger.logger.info "Disabling Max Import Size limit on environment..."
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { max_import_size: 10240 })
  end

  def restore_max_import_size_setting
    current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    return if !check_setting_available?(setting: 'max_import_size') || current_settings['max_import_size'] == @settings['max_import_size']

    GPTLogger.logger.info "Restoring the original 'max_import_size' setting..."
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { max_import_size: @settings['max_import_size'] })
  end

  # Groups

  def get_group(grp_path:)
    GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/groups/#{CGI.escape(grp_path)}", headers: @headers, fail_on_error: false, retry_on_error: true)
  end

  def check_group_exists(grp_path:)
    grp_check_res = get_group(grp_path: grp_path)
    return unless grp_check_res.status.success?

    GPTLogger.logger.info "Group #{grp_path} already exists"
    JSON.parse(grp_check_res.body.to_s).slice('id', 'name', 'full_path', 'description', 'marked_for_deletion_on')
  end

  def check_users_with_group_name(grp_path:)
    user_check_res = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/search?scope=users&search=#{grp_path}", headers: @headers, fail_on_error: false, retry_on_error: true)
    users = JSON.parse(user_check_res.body.to_s)
    users&.each do |user|
      raise GroupCheckError, "Root Group path '#{grp_path}' is already taken by user '#{user['username']}'. This isn't allowed on GitLab. To resolve, use a different group name by changing the `root_group` option in the Environment Config File." if user['username'] == grp_path
    end
  end

  def create_group(group_name:, parent_group: nil, log_only_to_file: false)
    grp_path = parent_group ? "#{parent_group['full_path']}/#{group_name}" : group_name
    grp_check_res = check_group_exists(grp_path: grp_path)

    GPTLogger.logger.warn Rainbow("\nGroup #{grp_path} has been scheduled to be deleted as per the environment's settings. If this is not expected it's recommended you confirm this on the GitLab environment and adjust directly where required.\nFor more info please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#group-or-project-is-marked-for-deletion\n").yellow unless grp_check_res&.dig('marked_for_deletion_on').nil?
    return grp_check_res unless grp_check_res.nil?

    GPTLogger.logger(only_to_file: log_only_to_file).info "Creating group #{grp_path}"

    grp_params = {
      name: group_name,
      path: group_name,
      visibility: 'public',
      description: @gpt_data_version_description
    }
    grp_params[:parent_id] = parent_group['id'] if parent_group
    grp_res = GPTCommon.make_http_request(method: 'post', url: "#{@env_api_url}/groups", params: grp_params, headers: @headers, retry_on_error: true)

    JSON.parse(grp_res.body.to_s).slice('id', 'name', 'full_path', 'description')
  end

  def create_groups(group_prefix:, parent_group: nil, groups_count:)
    GPTLogger.logger.info "Creating #{groups_count} groups with name prefix '#{group_prefix}' under parent group '#{parent_group['full_path']}'"
    groups = []
    retry_counter = 0
    progressbar = ProgressBar.create(title: 'Generating groups', total: groups_count, format: "%t: %c from %C |%b>%i| %E %a")

    ctx = OpenSSL::SSL::SSLContext.new
    ctx.verify_mode = OpenSSL::SSL::VERIFY_NONE

    begin
      # Tuning pool size depending on environment size
      pool_size = @storage_nodes.count * @default_pool_size
      groups_pool = ConnectionPool.new(size: pool_size, timeout: @default_pool_timeout) do
        HTTP.persistent(@env_url)
      end
      groups_nums = Array(1..groups_count)
      mutex = Mutex.new

      # Create `pool_size` threads to send parallel requests
      # by popping through `groups_nums` for each thread to spread
      # groups count by threads. Each thread sends multiple requests.
      groups_threads = Array.new(pool_size) do
        Thread.new(groups, groups_nums) do |groups, groups_nums|
          while groups_num = mutex.synchronize { groups_nums.pop }
            groups_pool.with do |http|
              group_name = "#{group_prefix}#{groups_num}"
              grp_path = "#{parent_group['full_path']}/#{group_name}"
              grp_check_res = http.get("#{@env_api_url.path}/groups/#{CGI.escape(grp_path)}", headers: @headers, ssl_context: ctx)
              if grp_check_res.status.success?
                existing_group = grp_check_res.parse.slice('id', 'name', 'full_path', 'description')
                mutex.synchronize { groups << existing_group }
                progressbar.increment
                GPTLogger.logger(only_to_file: true).info "Group #{existing_group['full_path']} already exists"
                next
              else
                grp_check_res.flush
              end

              grp_params = {
                name: group_name,
                path: group_name,
                parent_id: parent_group['id'],
                visibility: 'public',
                description: @gpt_data_version_description
              }
              grp_res = http.post("#{@env_api_url.path}/groups", params: grp_params, headers: @headers, ssl_context: ctx)
              unless grp_res.status.success?
                GPTLogger.logger(only_to_file: true).info "Error creating group '#{group_name}' (Attempt #{retry_counter}):\nCode: #{grp_res.code}\nResponse: #{grp_res.body}"
                grp_res.flush

                retry_counter += 1
                sleep @default_retry_wait
                redo unless retry_counter == @default_retry_count
                raise HTTP::ResponseError, "Creation of group '#{group_name}' has failed with the following error:\nCode: #{grp_res.code}\nResponse: #{grp_res.body}" if !grp_res.status.success? || grp_res.content_type.mime_type != 'application/json'
              end

              new_group = grp_res.parse.slice('id', 'name', 'full_path', 'description')
              mutex.synchronize { groups << new_group }
              progressbar.increment
              retry_counter = 0
              GPTLogger.logger(only_to_file: true).info "Creating group #{new_group['full_path']}"
            end
          end
        end
      end
      groups_threads.each(&:join)
    rescue Timeout::Error
      raise GroupCheckError, "Groups failed to be created due to response timeout from the target GitLab environment after #{@default_pool_timeout} seconds.\nConsider increasing timeout by passing 'GPT_GENERATOR_POOL_TIMEOUT' environment variable.\nTo troubleshoot please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#horizontal-data-generation-timeout"
    end

    puts "\n"
    groups
  end

  def delete_group(group:, log_only_to_file: false)
    GPTLogger.logger(only_to_file: log_only_to_file).info "Deleting group #{group['full_path']}"
    GPTCommon.make_http_request(method: 'delete', url: "#{@env_api_url}/groups/#{group['id']}", headers: @headers, fail_on_error: false, retry_on_error: true)
    GPTLogger.logger(only_to_file: log_only_to_file).info "Waiting for group #{group['full_path']} to be deleted..."
    wait_for_delete(entity_endpoint: "groups/#{group['id']}")
  end

  def recreate_group(group:, parent_group:, log_only_to_file: true)
    disable_soft_delete_settings unless ENV['SKIP_CHANGING_ENV_SETTINGS'] # Will disable soft delete only for the first time
    delete_group(group: group, log_only_to_file: log_only_to_file)
    create_group(group_name: group['name'], parent_group: parent_group, log_only_to_file: log_only_to_file)
  end

  # Projects

  def get_project(proj_path:)
    GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/projects/#{CGI.escape(proj_path)}", headers: @headers, fail_on_error: false)
  end

  def validate_project_data(proj_path:, storage:, project_metadata:)
    proj_check_res = get_project(proj_path: proj_path)
    raise ProjectCheckError, "Get project request failed!\nCode: #{proj_check_res.code}\nResponse: #{proj_check_res.body}\n" unless proj_check_res.status.success?

    GPTLogger.logger.info "Validating project '#{proj_path}' imported successfully..."
    @large_projects_validation_errors[proj_path] = []
    # Check that project was imported to the correct repo storage
    # Due to an issue https://gitlab.com/gitlab-org/gitlab/-/issues/227408 in GitLab versions 13.1 and 13.2
    project = JSON.parse(proj_check_res.body.to_s).slice('id', 'name', 'path_with_namespace', 'description', 'repository_storage', 'visibility')

    unless project['visibility'] == 'public'
      GPTLogger.logger.info "Project visibiliity '#{project['visibility']}' is different than required 'public' visibility. Updating..."
      GPTCommon.make_http_request(method: 'put', url: "#{@env_api_url}/projects/#{project['id']}", params: { visibility: 'public' }, headers: @headers)
    end

    version = project_metadata['version']
    unless project['description']&.match?(/^Version: #{version}/)
      project_version = project['description']&.match(/Version: (.*)/)
      version_prompt_message = project_version.nil? ? "version can't be determined." : "has a different version (#{project_version[1]}) than required (#{version})."
      version_error = "- Project #{version_prompt_message}"
      GPTLogger.logger.warn Rainbow(version_error).yellow
      @large_projects_validation_errors[proj_path] << version_error
    end

    unless storage == project['repository_storage']
      storage_error = "- Project repository storage '#{project['repository_storage']}' is different than expected '#{storage}' specified in Environment Config file.\nTo troubleshoot please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#repository-storages-config-cant-be-updated-via-application-settings-api."
      GPTLogger.logger.warn Rainbow(storage_error).yellow
      @large_projects_validation_errors[proj_path] << storage_error
    end

    return if @skip_project_validation

    issue_count = project_metadata['issue_count']
    check_project_entities_count(project: project, entity: 'issues', expected_count: issue_count)

    mr_count = project_metadata['merge_request_count']
    check_project_entities_count(project: project, entity: 'merge_requests', expected_count: mr_count)

    pipelines_count = project_metadata['pipelines_count']
    check_project_entities_count(project: project, entity: 'pipelines', expected_count: pipelines_count)
  end

  def check_project_entities_count(project:, entity:, expected_count:)
    existing_entity_count = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/projects/#{project['id']}/#{entity}", headers: @headers, retry_on_error: true, fail_on_error: false).headers.to_hash.transform_keys(&:downcase)["x-total"].to_i
    raise ProjectCheckError, "Project metadata '#{entity}' is mising in the Project Config file.\nTo learn more please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#configure-project-config-file." if expected_count.nil?

    return if existing_entity_count >= expected_count

    error_message = "- Project metadata validation failed: #{entity} count '#{existing_entity_count}' should be '#{expected_count}' or higher as specified in the Project Config file.\nTo troubleshoot please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#project-metadata-validation-has-failed."
    GPTLogger.logger.warn Rainbow(error_message).yellow
    @large_projects_validation_errors[project['path_with_namespace']] << error_message
  end

  def check_project_exists(proj_path:)
    proj_check_res = get_project(proj_path: proj_path)

    return unless proj_check_res.status.success?

    GPTLogger.logger.info "Project #{proj_path} already exists"
    JSON.parse(proj_check_res.body.to_s).slice('id', 'name', 'path_with_namespace', 'description')
  end

  def create_projects(project_prefix:, subgroups:, projects_count:)
    return if subgroups.count.zero?

    GPTLogger.logger.info "\nCreating #{projects_count} projects each under #{subgroups.size} subgroups with name prefix '#{project_prefix}'"
    projects = []
    retry_counter = 0
    progressbar = ProgressBar.create(title: 'Generating projects', total: projects_count * subgroups.count, format: "%t: %c from %C |%b>%i| %E %a")

    ctx = OpenSSL::SSL::SSLContext.new
    ctx.verify_mode = OpenSSL::SSL::VERIFY_NONE

    begin
      # Tuning pool size depending on environment size
      pool_size = @storage_nodes.count * @default_pool_size
      projects_pool = ConnectionPool.new(size: pool_size, timeout: @default_pool_timeout) do
        HTTP.persistent(@env_url)
      end
      mutex = Mutex.new

      # Create `pool_size` threads to send parallel requests
      # by popping through `subgroups` for each thread to spread
      # projects counts by threads. Each thread sends multiple requests.
      projects_threads = Array.new(pool_size) do
        Thread.new(subgroups, projects) do |parent_group, projects|
          while parent_group = mutex.synchronize { subgroups.pop }
            subgroup_num = parent_group['name'].split('-')[-1].to_i
            projects_count_start = projects_count * (subgroup_num - 1)

            projects_count.times do |num|
              projects_pool.with do |http|
                project_name = "#{project_prefix}#{projects_count_start + num + 1}"
                proj_path = "#{parent_group['full_path']}/#{project_name}"
                proj_check_res = http.get("#{@env_api_url.path}/projects/#{CGI.escape(proj_path)}", headers: @headers, ssl_context: ctx)
                if proj_check_res.status.success?
                  existing_project = proj_check_res.parse.slice('id', 'name', 'path_with_namespace', 'description')
                  mutex.synchronize { projects << existing_project }
                  progressbar.increment
                  GPTLogger.logger(only_to_file: true).info "Project #{existing_project['path_with_namespace']} already exists"
                  next
                else
                  proj_check_res.flush
                end

                proj_params = {
                  name: project_name,
                  path: project_name,
                  namespace_id: parent_group['id'],
                  visibility: 'public',
                  description: @gpt_data_version_description,
                  emails_disabled: true,
                  builds_access_level: 'disabled',
                  wiki_access_level: 'disabled',
                  initialize_with_readme: true
                }
                proj_res = http.post("#{@env_api_url.path}/projects", params: proj_params, headers: @headers, ssl_context: ctx)
                unless proj_res.status.success?
                  GPTLogger.logger(only_to_file: true).info "Error creating project '#{project_name}' (Attempt #{retry_counter}):\nCode: #{proj_res.code}\nResponse: #{proj_res.body}"
                  proj_res.flush

                  retry_counter += 1
                  sleep @default_retry_wait
                  redo unless retry_counter == @default_retry_count
                  raise HTTP::ResponseError, "Creation of project '#{project_name}' has failed with the following error:\nCode: #{proj_res.code}\nResponse: #{proj_res.body}" if !proj_res.status.success? || proj_res.content_type.mime_type != 'application/json'
                end

                new_project = proj_res.parse.slice('id', 'name', 'path_with_namespace', 'description')
                mutex.synchronize { projects << new_project }
                progressbar.increment
                retry_counter = 0
                GPTLogger.logger(only_to_file: true).info "Creating project #{new_project['path_with_namespace']}"
              end
            end
          end
        end
      end
      projects_threads.each(&:join)
    rescue Timeout::Error
      raise ProjectCheckError, "Projects failed to be created due to response timeout from the target GitLab environment after #{@default_pool_timeout} seconds.\nConsider increasing timeout by passing 'GPT_GENERATOR_POOL_TIMEOUT' environment variable.\nTo troubleshoot please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/environment_prep.md#horizontal-data-generation-timeout"
    end
    projects
  end

  def delete_project(project:)
    GPTLogger.logger.info "Delete existing project #{project}"
    GPTCommon.make_http_request(method: 'delete', url: "#{@env_api_url}/projects/#{project['id']}", headers: @headers, fail_on_error: false, retry_on_error: true)
    puts("Waiting for project #{project['path_with_namespace']} to be deleted...")
    wait_for_delete(entity_endpoint: "projects/#{project['id']}")
  end

  # Horizontal

  def create_horizontal_test_data(root_group:, parent_group:, subgroups_count:, subgroup_prefix:, projects_count:, project_prefix:)
    configure_repo_storage_settings(storage: @storage_nodes) unless ENV['SKIP_CHANGING_ENV_SETTINGS']

    existing_subgroups_count = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/groups/#{parent_group['id']}/subgroups", headers: @headers, retry_on_error: true).headers.to_hash.transform_keys(&:downcase)["x-total"].to_i
    parent_group = recreate_group(group: parent_group, parent_group: root_group, log_only_to_file: false) if existing_subgroups_count > subgroups_count

    sub_groups = create_groups(group_prefix: subgroup_prefix, parent_group: parent_group, groups_count: subgroups_count)
    GPTLogger.logger(only_to_file: true).info "Checking for existing projects under groups..."
    progressbar = ProgressBar.create(title: 'Checking for existing projects under groups', total: subgroups_count, format: "%t: %c from %C |%b>%i| %E %a")
    sub_groups_without_projects = []
    sub_groups.each do |sub_group|
      existing_projects_count = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/groups/#{sub_group['id']}/projects", headers: @headers, retry_on_error: true).headers.to_hash.transform_keys(&:downcase)["x-total"].to_i
      progressbar.increment

      if existing_projects_count.zero?
        sub_groups_without_projects << sub_group
      elsif existing_projects_count == projects_count
        GPTLogger.logger(only_to_file: true).info "Subgroup '#{sub_group['full_path']}' already have the correct number of projects."
        next
      else
        sub_groups_without_projects << recreate_group(group: sub_group, parent_group: parent_group)
      end
    end
    create_projects(project_prefix: project_prefix, subgroups: sub_groups_without_projects, projects_count: projects_count)
  end

  #  Vertical

  def select_default_large_project_tarball
    if @gitlab_version >= Semantic::Version.new('15.0.0')
      'https://gitlab.com/gitlab-org/quality/performance-data/-/raw/main/projects_export/gitlabhq_export_15.0.0.tar.gz'
    elsif @gitlab_version >= Semantic::Version.new('14.0.0') && @gitlab_version < Semantic::Version.new('15.0.0')
      'https://gitlab.com/gitlab-org/quality/performance-data/-/raw/main/projects_export/gitlabhq_export_14.0.0.tar.gz'
    elsif @gitlab_version >= Semantic::Version.new('13.0.0') && @gitlab_version < Semantic::Version.new('14.0.0')
      'https://gitlab.com/gitlab-org/quality/performance-data/-/raw/main/projects_export/gitlabhq_export_13.0.0.tar.gz'
    else
      'https://gitlab.com/gitlab-org/quality/performance-data/-/raw/main/projects_export/gitlabhq_export_12.5.0.tar.gz'
    end
  end

  def gql_queries
    @gql_queries ||= GQLQueries.new("#{@env_url}/api/graphql")
  end

  def create_vulnerability_report(proj_path:, vulnerabilities_count:)
    abort(Rainbow("EE license not found in #{@env_url} gitlab instance, exiting").yellow) unless check_gitlab_ultimate?
    check_vuln_api_supported
    project_details = check_project_exists(proj_path: proj_path)
    project_id_path = "gid://gitlab/Project/#{project_details['id']}"
    progress_bar = ProgressBar.create(title: 'Generating vulnerabilities', total: vulnerabilities_count, format: "%t: %c from %C |%b>%i| %E %a")
    vulnerabilities_count.times do
      gql_queries.create_vulnerability_data(project_id_path)
      progress_bar.increment
    end

    raise VulnerabilitiesCountError, "Creation of Vulnerability data has failed - Data count does not match between project data and parameter passed." unless vulnerabilities_count_matches?(proj_path: proj_path, vulnerabilities_count: vulnerabilities_count)
  end

  def vulnerabilities_count_matches?(proj_path:, vulnerabilities_count:)
    gql_queries.vulnerabilities_count(proj_path) == vulnerabilities_count
  end

  def check_vuln_api_supported
    return if @gitlab_version >= Semantic::Version.new('14.8.2')

    abort(Rainbow("Target Gitlab Environment v#{@gitlab_version} does not support creating vulnerabilities via api\n").yellow)
  end

  def create_vertical_test_data(project_tarball:, large_projects_group:, project_name:, project_metadata:)
    project_version = project_metadata['version']
    check_repo_storage_settings_type

    proj_tarball_file = nil
    @storage_nodes.each.with_index(1) do |gitaly_node, i|
      import_project = ImportProject.new(env_url: @env_url, project_tarball: project_tarball)
      new_project_name = "#{project_name}#{i}"
      proj_path = "#{large_projects_group['full_path']}/#{new_project_name}"
      project_description = "#{@gpt_data_version_description}. Please do not edit this project's description or data loss may occur.\n\nVersion: #{project_version}"

      GPTLogger.logger.info "Checking if project #{new_project_name} already exists in #{proj_path}..."
      existing_project = check_project_exists(proj_path: proj_path)
      if existing_project
        validate_project_data(proj_path: proj_path, storage: gitaly_node, project_metadata: project_metadata)

        if @large_projects_validation_errors[proj_path].empty?
          GPTLogger.logger.info "Project metadata matches metadata from the Project Config File.\nExisting large project #{existing_project['path_with_namespace']} is valid. Skipping project import..."
          next
        end

        prompt_message = "\nLarge project #{existing_project['path_with_namespace']} already exists on environment but with invalid data."
        GPTCommon.show_warning_prompt("#{prompt_message}\nThe Generator will replace this project.") unless @unattended

        disable_soft_delete_settings unless ENV['SKIP_CHANGING_ENV_SETTINGS']
        delete_project(project: existing_project)
      end

      disable_max_import_size_setting unless ENV['SKIP_CHANGING_ENV_SETTINGS']
      configure_repo_storage_settings(storage: gitaly_node) unless ENV['SKIP_CHANGING_ENV_SETTINGS'] # Due to bug: https://gitlab.com/gitlab-org/gitlab/-/issues/216994

      proj_tarball_file ||= import_project.setup_tarball(project_tarball: project_tarball)

      begin
        retries ||= 0
        import_project.import_project(proj_tarball_file: proj_tarball_file, project_name: new_project_name, namespace: large_projects_group['full_path'], storage_name: gitaly_node, project_description: project_description, with_cleanup: false)
      rescue GPTCommon::RequestError, ImportProject::ProjectImportError => e
        # Sometimes when project was deleted and responses with 404, it's still being deleted in background
        # We need to wait and retry to import
        raise e unless e.message.include?("The project is still being deleted. Please try again later.")

        GPTLogger.logger.warn(Rainbow("Project #{new_project_name} is still in the process of being deleted.\nRetrying in 5 seconds...\n").yellow)
        retries += 1
        raise e if retries > @max_wait_for_delete

        sleep 5
        retry
      end

      validate_project_data(proj_path: proj_path, storage: gitaly_node, project_metadata: project_metadata)
    end
  end
end
