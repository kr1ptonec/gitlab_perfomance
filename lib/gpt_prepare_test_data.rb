$LOAD_PATH.unshift File.expand_path('.', __dir__)
require 'run_k6'
module GPTPrepareTestData
  extend self

  def prepare_vertical_json_data(k6_dir:, env_file_vars:)
    is_large_project_custom = !env_file_vars['gpt_data']['large_projects']['root_group'].nil?
    warn Rainbow("GPT is running against a custom large project '#{env_file_vars['gpt_data']['large_projects']}'.").yellow if is_large_project_custom

    large_projects_root_group = is_large_project_custom ? env_file_vars['gpt_data']['large_projects']['root_group'] : env_file_vars['gpt_data']['root_group']
    large_project_parent_group = env_file_vars['gpt_data']['large_projects']['group']
    large_projects_group = large_project_parent_group.to_s.empty? ? large_projects_root_group : "#{large_projects_root_group}%2F#{large_project_parent_group}"
    large_project_file_name = env_file_vars['gpt_data']['large_projects']['project']
    large_projects_data_file = Dir.glob(["#{ENV['GPT_DOCKER_CONFIG_DIR'] || ''}/projects/#{large_project_file_name}.json", "#{k6_dir}/config/projects/#{large_project_file_name}.json", large_project_file_name])[0]
    raise "Project Config file '#{large_project_file_name}' not found as given or in default folder. Exiting..." if large_projects_data_file.nil?

    large_projects_data = JSON.parse(File.read(large_projects_data_file))
    large_projects_count = is_large_project_custom ? 1 : env_file_vars['environment']['storage_nodes'].size
    Array.new(large_projects_count) do |i|
      large_project_name = is_large_project_custom ? large_projects_data['name'] : "#{large_projects_data['name']}#{i + 1}"
      project = {
        'name' => large_project_name,
        'encoded_group_path' => large_projects_group,
        'encoded_path' => "#{large_projects_group}%2F#{large_project_name}",
        'unencoded_path' => "#{CGI.unescape(large_projects_group)}/#{large_project_name}"
      }
      large_projects_data.merge(project)
    end.to_json
  end

  def prepare_horizontal_json_data(env_file_vars:)
    many_gr_and_proj = env_file_vars['gpt_data']['many_groups_and_projects']
    many_gr_and_proj_encoded_group_path = "#{env_file_vars['gpt_data']['root_group']}%2F#{many_gr_and_proj['group']}"
    many_gr_and_proj_unencoded_group_path = "#{env_file_vars['gpt_data']['root_group']}/#{many_gr_and_proj['group']}"
    required_keys = %w[group subgroups subgroup_prefix projects project_prefix]

    return {}.to_json unless required_keys.all? { |required_key| many_gr_and_proj.key?(required_key) }

    {
      'encoded_group_path' => many_gr_and_proj_encoded_group_path,
      'unencoded_group_path' => many_gr_and_proj_unencoded_group_path,
      'subgroups_count' => many_gr_and_proj['subgroups'],
      'subgroup_prefix' => many_gr_and_proj['subgroup_prefix'],
      'projects_count' => many_gr_and_proj['projects'],
      'project_prefix' => many_gr_and_proj['project_prefix']
    }.to_json
  end

  def vulnerabilities_projects_group(env_file_vars:)
    return unless check_vulnerabilities_group_defined?(env_file_vars: env_file_vars)

    vulnerabilities_section = env_file_vars['gpt_data']['vulnerabilities_projects']
    vulnerabilities_group_encoded_path = "#{env_file_vars['gpt_data']['root_group']}%2F#{vulnerabilities_section['group']}"
    vulnerabilities_group_unencoded_path = "#{env_file_vars['gpt_data']['root_group']}/#{vulnerabilities_section['group']}"
    required_keys = %w[group projects project_prefix vulnerabilities_count]

    return {}.to_json unless required_keys.all? { |required_key| vulnerabilities_section.key?(required_key) }

    {
      'encoded_group_path' => vulnerabilities_group_encoded_path,
      'unencoded_group_path' => vulnerabilities_group_unencoded_path,
      'projects_count' => vulnerabilities_section['projects'],
      'project_prefix' => vulnerabilities_section['project_prefix']
    }.to_json
  end

  def check_vulnerabilities_group_defined?(env_file_vars:)
    env_file_vars['gpt_data'].key?('vulnerabilities_projects')
  end

  # Git Push Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/test_docs/git_push.md

  # This method prepares binary files with git push data for git push test
  # It combines existing commits and branch with hardcoded binary data
  # More information: https://gitlab.com/gitlab-org/quality/performance/-/blob/main/docs/test_docs/git_push.md#how-does-it-work
  def prepare_git_push_data(env_vars:)
    project_data = JSON.parse(env_vars["ENVIRONMENT_LARGE_PROJECTS"]).first

    return false if project_data['git_push_data'].nil?

    expected_keys = %w[branch_current_head_sha branch_new_head_sha branch_name]

    project_data["git_push_data"].each do |push_data|
      return false unless expected_keys.all? { |subkey| push_data.key?(subkey) }

      branch_current_head = push_data["branch_current_head_sha"]
      branch_new_head = push_data["branch_new_head_sha"]
      branch_name =  push_data["branch_name"]

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
end
