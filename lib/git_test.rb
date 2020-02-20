$LOAD_PATH.unshift File.expand_path('.', __dir__)
require 'run_k6'

module GitTest
  extend self

  # Git Push Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md

  # This method prepares binary files with git push data for git push test
  # It combines existing commits and branch with hardcoded binary data
  # More information: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md#how-does-it-work
  def prepare_git_push_data(env_vars:)
    projects = JSON.parse(env_vars["ENVIRONMENT_PROJECTS"])
    projects.each do |project|
      branch_current_head = project["git_push_data"]["branch_current_head_sha"]
      branch_new_head = project["git_push_data"]["branch_new_head_sha"]
      branch_name =  project["git_push_data"]["branch_name"]

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
      set_new_head_data_path = "#{data_path}/set_new_head-#{project['name']}-#{branch_new_head}.bundle"
      File.write(set_new_head_data_path, set_new_head_data, mode: 'w+')

      set_old_head_data_path = "#{data_path}/set_old_head-#{project['name']}-#{branch_current_head}.bundle"
      File.write(set_old_head_data_path, set_old_head_data, mode: 'w+')
    end
  end
end
