$LOAD_PATH.unshift File.expand_path('.', __dir__)

require 'cgi'
require 'gpt_common'
require 'import_project'
require 'rainbow'
require 'tty-spinner'

class GPTTestData
  attr_reader :root_group

  WaitForDeleteError = Class.new(StandardError)

  def initialize(gpt_data_version:, force:, unattended:, env_url:, root_group:, storage_nodes:, max_wait_for_delete:)
    @gpt_data_version_description = "Generated and maintained by GPT Data Generator v#{gpt_data_version}"
    @force = force
    @unattended = unattended
    @env_url = env_url
    @headers = { 'PRIVATE-TOKEN': ENV['ACCESS_TOKEN'] }
    @max_wait_for_delete = max_wait_for_delete
    @storage_nodes = storage_nodes

    GPTCommon.check_gitlab_env_and_token(env_url: @env_url)
    @settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    @root_group = create_group(group_name: root_group)
  end

  # Shared

  def wait_for_delete(entity_endpoint)
    start = Time.new
    loop do
      elapsed = (Time.new - start).to_i
      raise WaitForDeleteError, "Waiting failed after #{elapsed} seconds. Consider increasing `--max-wait-for-delete` option. Exiting..." if elapsed >= @max_wait_for_delete

      check_deleted_entity = GPTCommon.make_http_request(method: 'get', url: "#{@env_url}/api/v4/#{entity_endpoint}", headers: @headers, fail_on_error: false)
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

  def check_repo_storage_setting?(setting)
    current_settings = GPTCommon.get_env_settings(env_url: @env_url, headers: @headers)
    current_settings['repository_storages'] == setting
  end

  def configure_repo_storage(storage:)
    return if check_repo_storage_setting?([storage].flatten)

    GPTLogger.logger.info "Updating GitLab Application setting 'repository_storages' to '#{storage}'"
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { 'repository_storages[]': storage })
  end

  def restore_repo_storage_config
    return if @settings['repository_storages'].nil? || check_repo_storage_setting?(@settings['repository_storages'])

    GPTLogger.logger.info "Restoring the original 'repository_storages' GitLab Application setting."
    GPTCommon.change_env_settings(env_url: @env_url, headers: @headers, settings: { 'repository_storages[]': @settings['repository_storages'] })
  end

  # Groups

  def get_group(grp_path:)
    GPTCommon.make_http_request(method: 'get', url: "#{@env_url}/api/v4/groups/#{CGI.escape(grp_path)}", headers: @headers, fail_on_error: false)
  end

  def check_group_exists(grp_path)
    grp_check_res = get_group(grp_path: grp_path)

    return unless grp_check_res.status.success?

    GPTLogger.logger.info "Group #{grp_path} already exists"
    JSON.parse(grp_check_res.body.to_s).slice('id', 'name', 'full_path', 'description')
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
    grp_res = GPTCommon.make_http_request(method: 'post', url: "#{@env_url}/api/v4/groups", params: grp_params, headers: @headers)

    JSON.parse(grp_res.body.to_s).slice('id', 'name', 'full_path', 'description')
  end

  def delete_group(group)
    GPTLogger.logger.info "Delete old group #{group['full_path']}"
    GPTCommon.make_http_request(method: 'delete', url: "#{@env_url}/api/v4/groups/#{group['id']}", headers: @headers)
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
    GPTCommon.make_http_request(method: 'get', url: "#{@env_url}/api/v4/projects/#{CGI.escape(proj_path)}", headers: @headers, fail_on_error: false)
  end

  def check_project_exists(proj_path)
    proj_check_res = get_project(proj_path: proj_path)

    return unless proj_check_res.status.success?

    GPTLogger.logger.info "Project #{proj_path} already exists"
    JSON.parse(proj_check_res.body.to_s).slice('id', 'name', 'path_with_namespace', 'description')
  end

  def create_project(project_name:, parent_group:)
    proj_path = parent_group ? "#{parent_group['full_path']}/#{project_name}" : project_name
    proj_check_res = check_project_exists(proj_path)
    return proj_check_res unless proj_check_res.nil?

    GPTLogger.logger.info "Creating project #{proj_path}"

    proj_params = {
      name: project_name,
      path: project_name,
      visibility: 'public',
      description: @gpt_data_version_description
    }
    proj_params[:namespace_id] = parent_group['id'] if parent_group
    proj_res = GPTCommon.make_http_request(method: 'post', url: "#{@env_url}/api/v4/projects", params: proj_params, headers: @headers)

    JSON.parse(proj_res.body.to_s).slice('id', 'name', 'path_with_namespace', 'description')
  end

  def delete_project(project)
    GPTLogger.logger.info "Delete existing project #{project}"
    GPTCommon.make_http_request(method: 'delete', url: "#{@env_url}/api/v4/projects/#{project['id']}", headers: @headers)
    print("Waiting for project #{project['path_with_namespace']} to be deleted...")
    wait_for_delete("projects/#{project['id']}")
  end

  # Horiztonal \ Vertical

  def create_horizontal_test_data(parent_group:, subgroups_count:, subgroup_prefix:, projects_count:, project_prefix:)
    configure_repo_storage(storage: @storage_nodes) unless ENV['SKIP_CHANGING_ENV_SETTINGS']

    existing_subgroups_count = GPTCommon.make_http_request(method: 'get', url: "#{@env_url}/api/v4/groups/#{parent_group['id']}/subgroups", headers: @headers).headers.to_hash["X-Total"].to_i
    parent_group = recreate_group(group: parent_group, parent_group: @root_group) if existing_subgroups_count > subgroups_count

    sub_groups = Array.new(subgroups_count) do |num|
      create_group(group_name: "#{subgroup_prefix}#{num + 1}", parent_group: parent_group)
    end

    sub_groups.each_with_index do |sub_group, i|
      existing_projects_count = GPTCommon.make_http_request(method: 'get', url: "#{@env_url}/api/v4/groups/#{sub_group['id']}/projects", headers: @headers).headers.to_hash["X-Total"].to_i
      sub_group = recreate_group(group: sub_group, parent_group: parent_group) if existing_projects_count > projects_count
      projects_count.times do |num|
        create_project(project_name: "#{project_prefix}#{i * projects_count + num + 1}", parent_group: sub_group)
      end
    end
  end

  def create_vertical_test_data(project_tarball:, large_projects_group:, project_name:, project_version:)
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
      elsif existing_project['description'].match?(/^Version: #{project_version}/)
        GPTLogger.logger.info "Project version number matches version from the Project Config File.\nExisting large project #{existing_project['path_with_namespace']} is valid. Skipping project import..."
        next
      else
        existing_project_version = existing_project['description'].match(/Version: (.*)/)
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
    end
  end
end
