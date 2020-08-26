$LOAD_PATH.unshift File.expand_path('.', __dir__)

require 'cgi'
require 'gpt_common'
require 'http'
require 'import_project'
require 'rainbow'
require 'tty-spinner'
require 'uri'

class GPTTestData
  attr_reader :root_group

  WaitForDeleteError = Class.new(StandardError)
  IncorrectProjectRepoStorage = Class.new(StandardError)
  GetProjectError = Class.new(StandardError)
  GroupPathTaken = Class.new(StandardError)

  def initialize(gpt_data_version:, force:, unattended:, env_url:, root_group:, storage_nodes:, max_wait_for_delete:)
    @gpt_data_version_description = "Generated and maintained by GPT Data Generator v#{gpt_data_version}"
    @force = force
    @unattended = unattended
    @env_url = env_url.chomp('/')
    @env_api_url = URI.join(@env_url + '/', "api/v4")
    @headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    @max_wait_for_delete = max_wait_for_delete
    @storage_nodes = storage_nodes

    @gitlab_version = GPTCommon.check_gitlab_env_and_token(env_url: @env_url)
    @settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    check_users_with_group_name(root_group)
    @root_group = create_group(group_name: root_group)
  end

  # Shared

  def wait_for_delete(entity_endpoint)
    start = Time.new
    loop do
      elapsed = (Time.new - start).to_i
      raise WaitForDeleteError, "Waiting failed after #{elapsed} seconds. Consider increasing `--max-wait-for-delete` option. Exiting..." if elapsed >= @max_wait_for_delete

      check_deleted_entity = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/#{entity_endpoint}", headers: @headers, fail_on_error: false, retry_on_error: true)
      break if check_deleted_entity.status.code == 404
      raise WaitForDeleteError, "#{method.upcase} request failed!\nCode: #{check_deleted_entity.code}\nResponse: #{check_deleted_entity.body}\n" if check_deleted_entity.status.to_s.match?(/5\d{2}$/)

      print '.'
      sleep 1
    end
  end

  # Settings

  def disable_soft_delete
    # Deletion adjourned period is only available for GitLab Premium or Ultimate
    # For other tiers settings won't have 'deletion_adjourned_period'
    return if @settings['deletion_adjourned_period'].nil? || @settings['deletion_adjourned_period'].zero?

    current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    return if current_settings['deletion_adjourned_period'].zero?

    # Workaround until https://gitlab.com/gitlab-org/gitlab/-/issues/191367 is addressed
    GPTCommon.show_warning_prompt("The GPT Data Generator will update GitLab Environment 'deletion_adjourned_period' setting to disable soft-delete and remove GPT data immediately.\nWhile the 'generate-gpt-data' script is running any other projects or groups if deleted will also be removed immediately.\nThe original setting will be restored after the the script is finished.") unless @unattended
    GPTLogger.logger.info "Disabling soft-delete by updating 'deletion_adjourned_period' to 0"
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { deletion_adjourned_period: 0 })
  end

  def restore_soft_delete_settings
    return if @settings['deletion_adjourned_period'].nil?

    current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    return if current_settings['deletion_adjourned_period'] == @settings['deletion_adjourned_period']

    GPTLogger.logger.info "Restoring the original 'deletion_adjourned_period' setting."
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { deletion_adjourned_period: @settings['deletion_adjourned_period'] })
  end

  def weighted_repo_storages_supported?
    @settings.key?('repository_storages_weighted')
  end

  def check_repo_storage_support
    # Check that the fix https://gitlab.com/gitlab-org/gitlab/-/merge_requests/36376 is
    # available on a target environment and we can change `repository_storages_weighted` via API.
    # This is an additional safeguard in case env is on 13.2-pre versions where the fix is in place after `13.2.0-pre a3ee515ecc`
    return if weighted_repo_storages_supported?

    return unless @gitlab_version >= Semantic::Version.new('13.1.0') && @gitlab_version < Semantic::Version.new('13.2.2')

    abort(Rainbow("Target GitLab environment v#{@gitlab_version} is affected by an issue that prevents Repository Storage config changes via API.\nDue to this we recommend you update the environment to version '13.2.2' or higher to proceed or import large projects manually.\nTo learn more please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/environment_prep.md#repository-storages-config-cant-be-updated-via-application-settings-api.\n").yellow)
  end

  def check_repo_storage_setting?(setting)
    current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    return current_settings['repository_storages'] == setting unless weighted_repo_storages_supported?

    setting = setting.product([100]).to_h if setting.is_a?(Array)
    current_settings['repository_storages_weighted'] == setting
  end

  def get_storage_settings(storages)
    storage_settings = {}
    if weighted_repo_storages_supported?
      # (GitLab 13.1 and later) Hash of names of enabled storage paths with weights.
      # New projects are created in one of these stores, chosen by a weighted random selection.
      # https://docs.gitlab.com/ee/administration/repository_storage_paths.html#choose-where-new-repositories-will-be-stored
      storages = storages.product([100]).to_h if storages.is_a?(Array)

      storages.each { |storage, weight| storage_settings["repository_storages_weighted[#{storage}]"] = weight }
    else
      # (GitLab 13.0 and earlier) List of names of enabled storage paths.
      # New projects are created in one of these stores, chosen at random.
      storage_settings = { 'repository_storages[]': storages }
    end
    storage_settings
  end

  def configure_repo_storage(storage:)
    storage = [storage] if storage.is_a?(String)
    return if check_repo_storage_setting?(storage)

    storage_settings = get_storage_settings(storage)
    GPTLogger.logger.info "Updating GitLab Application Repository Storage setting"
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: storage_settings)
  end

  def restore_repo_storage_config
    repo_storage_setting = weighted_repo_storages_supported? ? @settings['repository_storages_weighted'] : @settings['repository_storages']
    return if repo_storage_setting.nil? || check_repo_storage_setting?(repo_storage_setting)

    storage_settings = get_storage_settings(repo_storage_setting)
    GPTLogger.logger.info "Restoring the original Repository Storage setting in GitLab Application."
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: storage_settings)
  end

  # Groups

  def get_group(grp_path:)
    GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/groups/#{CGI.escape(grp_path)}", headers: @headers, fail_on_error: false, retry_on_error: true)
  end

  def check_group_exists(grp_path)
    grp_check_res = get_group(grp_path: grp_path)

    return unless grp_check_res.status.success?

    GPTLogger.logger.info "Group #{grp_path} already exists"
    JSON.parse(grp_check_res.body.to_s).slice('id', 'name', 'full_path', 'description')
  end

  def check_users_with_group_name(grp_path)
    user_check_res = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/search?scope=users&search=#{grp_path}", headers: @headers, fail_on_error: false, retry_on_error: true)
    users = JSON.parse(user_check_res.body.to_s)
    raise GroupPathTaken, "Root Group path '#{grp_path}' is already taken by user #{user}.\nPlease change their username or use a different group name by changing the `root_group` option in Environment Config File." if users&.any? { |user| user['username'] == grp_path }
  end

  def create_group(group_name:, parent_group: nil)
    grp_path = parent_group ? "#{parent_group['full_path']}/#{group_name}" : group_name
    grp_check_res = check_group_exists(grp_path)
    return grp_check_res unless grp_check_res.nil?

    GPTLogger.logger.info "Creating group #{grp_path}"

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
    GPTLogger.logger.info "Creating #{groups_count} groups with name prefix '#{group_prefix}'" + (" under parent group '#{parent_group['full_path']}'" if parent_group)
    groups = []
    redo_count = 0
    HTTP.persistent @env_url do |http|
      groups_count.times do |num|
        group_name = "#{group_prefix}#{num + 1}"
        grp_path = parent_group ? "#{parent_group['full_path']}/#{group_name}" : group_name
        grp_check_res = http.get("#{@env_api_url.path}/groups/#{CGI.escape(grp_path)}", headers: @headers)
        if grp_check_res.status.success?
          existing_group = grp_check_res.parse.slice('id', 'name', 'full_path', 'description')
          groups << existing_group
          print '*'
          GPTLogger.logger(only_to_file: true).info "Group #{existing_group['full_path']} already exists"
          next
        else
          grp_check_res.flush
        end

        grp_params = {
          name: group_name,
          path: group_name,
          visibility: 'public',
          description: @gpt_data_version_description
        }
        grp_params[:parent_id] = parent_group['id'] if parent_group
        grp_res = http.post("#{@env_api_url.path}/groups", params: grp_params, headers: @headers)
        unless grp_res.status.success?
          print 'x'
          GPTLogger.logger(only_to_file: true).info "Error creating group '#{group_name}' (Attempt #{redo_count}):\nCode: #{grp_res.code}\nResponse: #{grp_res.body}"
          grp_res.flush

          redo_count += 1
          sleep 1
          redo unless redo_count == 5
          raise HTTP::ResponseError, "Creation of group '#{group_name}' has failed with the following error:\nCode: #{grp_res.code}\nResponse: #{grp_res.body}" if !grp_res.status.success? || grp_res.content_type.mime_type != 'application/json'
        end

        new_group = grp_res.parse.slice('id', 'name', 'full_path', 'description')
        groups << new_group
        print '.'
        redo_count = 0
        GPTLogger.logger(only_to_file: true).info "Creating group #{new_group['full_path']}"
      end
    end
    puts "\n"
    groups
  end

  def delete_group(group)
    GPTLogger.logger.info "Delete old group #{group['full_path']}"
    GPTCommon.make_http_request(method: 'delete', url: "#{@env_api_url}/groups/#{group['id']}", headers: @headers, retry_on_error: true)
    print("Waiting for group #{group['full_path']} to be deleted...")
    wait_for_delete("groups/#{group['id']}")
  end

  def recreate_group(group:, parent_group:)
    disable_soft_delete unless ENV['SKIP_CHANGING_ENV_SETTINGS'] # Will disable soft delete only for the first time
    delete_group(group)
    create_group(group_name: group['name'], parent_group: parent_group)
  end

  # Projects

  def get_project(proj_path:)
    GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/projects/#{CGI.escape(proj_path)}", headers: @headers, fail_on_error: false)
  end

  def check_proj_repo_storage(proj_path:, storage:)
    proj_check_res = get_project(proj_path: proj_path)
    raise GetProjectError, "Get project request failed!\nCode: #{proj_check_res.code}\nResponse: #{proj_check_res.body}\n" unless proj_check_res.status.success?

    project = JSON.parse(proj_check_res.body.to_s).slice('id', 'name', 'path_with_namespace', 'repository_storage')
    raise IncorrectProjectRepoStorage, "Large Project repository storage '#{project['repository_storage']}' is different than expected '#{storage}' specified in Environment Config file.\nProject details: #{project}\nTo troubleshoot please refer to https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/environment_prep.md#large-project-repository-storage-is-different-than-expected." unless storage == project['repository_storage']
  end

  def check_project_exists(proj_path)
    proj_check_res = get_project(proj_path: proj_path)

    return unless proj_check_res.status.success?

    GPTLogger.logger.info "Project #{proj_path} already exists"
    JSON.parse(proj_check_res.body.to_s).slice('id', 'name', 'path_with_namespace', 'description')
  end

  def create_projects(project_prefix:, subgroups:, projects_count:)
    GPTLogger.logger.info "Creating #{projects_count} projects each under #{subgroups.size} subgroups with name prefix '#{project_prefix}'"
    projects = []
    redo_count = 0
    HTTP.persistent @env_url do |http|
      subgroups.each_with_index do |parent_group, i|
        projects_count_start = i * projects_count

        projects_count.times do |num|
          project_name = "#{project_prefix}#{projects_count_start + num + 1}"
          proj_path = parent_group ? "#{parent_group['full_path']}/#{project_name}" : project_name
          proj_check_res = http.get("#{@env_api_url.path}/projects/#{CGI.escape(proj_path)}", headers: @headers)
          if proj_check_res.status.success?
            existing_project = proj_check_res.parse.slice('id', 'name', 'path_with_namespace', 'description')
            projects << existing_project
            print '*'
            GPTLogger.logger(only_to_file: true).info "Project #{existing_project['path_with_namespace']} already exists"
            next
          else
            proj_check_res.flush
          end

          proj_params = {
            name: project_name,
            path: project_name,
            visibility: 'public',
            description: @gpt_data_version_description
          }
          proj_params[:namespace_id] = parent_group['id'] if parent_group
          proj_res = http.post("#{@env_api_url.path}/projects", params: proj_params, headers: @headers)
          unless proj_res.status.success?
            print 'x'
            GPTLogger.logger(only_to_file: true).info "Error creating project '#{project_name}' (Attempt #{redo_count}):\nCode: #{proj_res.code}\nResponse: #{proj_res.body}"
            proj_res.flush

            redo_count += 1
            sleep 1
            redo unless redo_count == 5
            raise HTTP::ResponseError, "Creation of project '#{project_name}' has failed with the following error:\nCode: #{proj_res.code}\nResponse: #{proj_res.body}" if !proj_res.status.success? || proj_res.content_type.mime_type != 'application/json'
          end

          new_project = proj_res.parse.slice('id', 'name', 'path_with_namespace', 'description')
          projects << new_project
          print '.'
          redo_count = 0
          GPTLogger.logger(only_to_file: true).info "Creating project #{new_project['path_with_namespace']}"
        end
      end
    end
    projects
  end

  def delete_project(project)
    GPTLogger.logger.info "Delete existing project #{project}"
    GPTCommon.make_http_request(method: 'delete', url: "#{@env_api_url}/projects/#{project['id']}", headers: @headers, retry_on_error: true)
    print("Waiting for project #{project['path_with_namespace']} to be deleted...")
    wait_for_delete("projects/#{project['id']}")
  end

  # Horiztonal

  def create_horizontal_test_data(parent_group:, subgroups_count:, subgroup_prefix:, projects_count:, project_prefix:)
    configure_repo_storage(storage: @storage_nodes) unless ENV['SKIP_CHANGING_ENV_SETTINGS']

    existing_subgroups_count = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/groups/#{parent_group['id']}/subgroups", headers: @headers, retry_on_error: true).headers.to_hash["X-Total"].to_i
    parent_group = recreate_group(group: parent_group, parent_group: @root_group) if existing_subgroups_count > subgroups_count

    sub_groups = create_groups(group_prefix: subgroup_prefix, parent_group: parent_group, groups_count: subgroups_count)
    GPTLogger.logger.info "Checking for existing projects under groups..."
    sub_groups.map! do |sub_group|
      existing_projects_count = GPTCommon.make_http_request(method: 'get', url: "#{@env_api_url}/groups/#{sub_group['id']}/projects", headers: @headers, retry_on_error: true).headers.to_hash["X-Total"].to_i
      sub_group = recreate_group(group: sub_group, parent_group: parent_group) if existing_projects_count > projects_count
      sub_group
    end
    create_projects(project_prefix: project_prefix, subgroups: sub_groups, projects_count: projects_count)
  end

  #  Vertical

  def create_vertical_test_data(project_tarball:, large_projects_group:, project_name:, project_version:)
    check_repo_storage_support

    proj_tarball_file = nil
    @storage_nodes.each.with_index(1) do |gitaly_node, i|
      import_project = ImportProject.new(env_url: @env_url, project_tarball: project_tarball)
      new_project_name = "#{project_name}#{i}"
      proj_path = "#{large_projects_group['full_path']}/#{new_project_name}"

      GPTLogger.logger.info "Checking if project #{new_project_name} already exists in #{proj_path}..."
      existing_project = check_project_exists(proj_path)
      project_description = "#{@gpt_data_version_description}. Please do not edit this project's description or data loss may occur.\n\nVersion: #{project_version}"

      # Import only if either the project doesn't exist or if its version number doesn't match config in the project's description
      if existing_project.nil?
        configure_repo_storage(storage: gitaly_node) unless ENV['SKIP_CHANGING_ENV_SETTINGS'] # Due to bug: https://gitlab.com/gitlab-org/gitlab/-/issues/216994
        proj_tarball_file ||= import_project.setup_tarball(project_tarball: project_tarball)
        import_project.import_project(proj_tarball_file: proj_tarball_file, project_name: new_project_name, namespace: large_projects_group['full_path'], storage_name: gitaly_node, project_description: project_description, with_cleanup: false)
      elsif existing_project['description']&.match?(/^Version: #{project_version}/)
        GPTLogger.logger.info "Project version number matches version from the Project Config File.\nExisting large project #{existing_project['path_with_namespace']} is valid. Skipping project import..."
        next
      else
        existing_project_version = existing_project['description']&.match?(/Version: (.*)/)
        version_prompt_message = existing_project_version.nil? ? "its version can't be determined." : "is a different version (#{existing_project_version[1]} > #{project_version})."
        GPTCommon.show_warning_prompt("Large project #{existing_project['path_with_namespace']} already exists on environment but #{version_prompt_message}\nThe Generator will replace this project.") unless @force
        disable_soft_delete unless ENV['SKIP_CHANGING_ENV_SETTINGS']
        delete_project(existing_project)
        configure_repo_storage(storage: gitaly_node) unless ENV['SKIP_CHANGING_ENV_SETTINGS'] # Due to bug: https://gitlab.com/gitlab-org/gitlab/-/issues/216994
        proj_tarball_file ||= import_project.setup_tarball(project_tarball: project_tarball)

        begin
          retries ||= 0
          import_project.import_project(proj_tarball_file: proj_tarball_file, project_name: new_project_name, namespace: large_projects_group['full_path'], storage_name: gitaly_node, project_description: project_description, with_cleanup: false)
        rescue GPTCommon::RequestError => e
          # Sometimes when project was deleted and responses with 404, it's still being deleted in background
          # We need to wait and retry to import
          raise e unless e.message.include?("The project is still being deleted. Please try again later.")

          GPTLogger.logger.warn(Rainbow("Project #{new_project_name} is still in the process of being deleted.\nRetrying in 5 seconds...").yellow)
          retries += 1
          raise e if retries > @max_wait_for_delete

          sleep 5
          retry
        end
      end
      # Check that project was imported to the correct repo storage
      # Due to an issue https://gitlab.com/gitlab-org/gitlab/-/issues/227408 in GitLab versions 13.1 and 13.2
      check_proj_repo_storage(proj_path: proj_path, storage: gitaly_node)
    end
  end
end
