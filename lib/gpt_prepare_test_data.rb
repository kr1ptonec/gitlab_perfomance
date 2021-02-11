$LOAD_PATH.unshift File.expand_path('.', __dir__)
require 'run_k6'
module GPTPrepareTestData
  extend self

  def prepare_vertical_json_data(k6_dir:, env_file_vars:)
    large_projects_group = "#{env_file_vars['gpt_data']['root_group']}%2F#{env_file_vars['gpt_data']['large_projects']['group']}"
    large_project_file_name = env_file_vars['gpt_data']['large_projects']['project']
    large_projects_data_file = Dir.glob(["#{ENV['GPT_DOCKER_CONFIG_DIR'] || ''}/projects/#{large_project_file_name}.json", "#{k6_dir}/config/projects/#{large_project_file_name}.json", large_project_file_name])[0]
    raise "Project Config file '#{large_project_file_name}' not found as given or in default folder. Exiting..." if large_projects_data_file.nil?

    large_projects_data = JSON.parse(File.read(large_projects_data_file))
    large_projects_count = env_file_vars['environment']['storage_nodes'].size
    Array.new(large_projects_count) do |i|
      project = {
        'name' => "#{large_projects_data['name']}#{i + 1}",
        'group_path_api' => large_projects_group,
        'group_path_web' => CGI.unescape(large_projects_group),
        'encoded_path' => "#{large_projects_group}%2F#{large_projects_data['name']}#{i + 1}"
      }
      large_projects_data.merge(project)
    end.to_json
  end

  def prepare_horizontal_json_data(env_file_vars:)
    many_gr_and_proj = env_file_vars['gpt_data']['many_groups_and_projects']
    many_gr_and_proj_group_path_api = "#{env_file_vars['gpt_data']['root_group']}%2F#{many_gr_and_proj['group']}"
    many_gr_and_proj_group_path_web = "#{env_file_vars['gpt_data']['root_group']}/#{many_gr_and_proj['group']}"
    required_keys = %w[group subgroups subgroup_prefix projects project_prefix]

    return {}.to_json unless required_keys.all? { |required_key| many_gr_and_proj.key?(required_key) }

    subgroups_path_api = 1.upto(many_gr_and_proj['subgroups']).map do |i|
      "#{many_gr_and_proj_group_path_api}%2F#{many_gr_and_proj['subgroup_prefix']}#{i}"
    end

    subgroups_path_web = 1.upto(many_gr_and_proj['subgroups']).map do |i|
      "#{many_gr_and_proj_group_path_web}/#{many_gr_and_proj['subgroup_prefix']}#{i}"
    end

    # N projects in each subgroup
    projects = 1.upto(many_gr_and_proj['subgroups'] * many_gr_and_proj['projects']).map do |i|
      "#{many_gr_and_proj['project_prefix']}#{i}"
    end

    {
      'group_path_api' => many_gr_and_proj_group_path_api,
      'group_path_web' => many_gr_and_proj_group_path_web,
      'subgroups_path_api' => subgroups_path_api,
      'subgroups_path_web' => subgroups_path_web,
      'projects' => projects
    }.to_json
  end

  # Git Push Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md

  # This method prepares binary files with git push data for git push test
  # It combines existing commits and branch with hardcoded binary data
  # More information: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md#how-does-it-work
  def prepare_git_push_data(env_vars:)
    project_data = JSON.parse(env_vars["ENVIRONMENT_LARGE_PROJECTS"]).first

    return false if project_data['git_push_data'].nil? || %w[branch_current_head_sha","branch_new_head_sha","branch_name"].all? { |subkey| project_data["git_push_data"].key?(subkey) }

    branch_current_head = project_data["git_push_data"]["branch_current_head_sha"]
    branch_new_head = project_data["git_push_data"]["branch_new_head_sha"]
    branch_name =  project_data["git_push_data"]["branch_name"]

    git_data_dir = Pathname.new(File.expand_path('../k6/tests/git/push_data', __dir__)).relative_path_from(Dir.pwd)
    set_new_head = "#{branch_current_head} #{branch_new_head} refs/heads/#{branch_name}"
    set_old_head = "#{branch_new_head} #{branch_current_head} refs/heads/#{branch_name}"
    binary_data = File.read("#{git_data_dir}/binary_data.bundle")

    client_capabilities = binary_data.encode('UTF-8', 'binary', invalid: :replace, undef: :replace, replace: '').match(/(.*)0000PACK/)[1]
    offset = 4 # 4 symbols of pkt-line length
    pkt_line_length = "00#{(set_new_head.size + client_capabilities.size + offset).to_s(16)}"

    set_new_head_data = "#{pkt_line_length}#{set_new_head}#{binary_data}"
    set_old_head_data = "#{pkt_line_length}#{set_old_head}#{binary_data}"

    data_path = FileUtils.mkdir_p("#{git_data_dir}/data")[0]
    set_new_head_data_path = "#{data_path}/set_new_head-#{branch_new_head}.bundle"
    File.write(set_new_head_data_path, set_new_head_data, mode: 'w+')

    set_old_head_data_path = "#{data_path}/set_old_head-#{branch_current_head}.bundle"
    File.write(set_old_head_data_path, set_old_head_data, mode: 'w+')
  end
end
