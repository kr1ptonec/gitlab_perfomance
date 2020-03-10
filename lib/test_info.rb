$LOAD_PATH.unshift File.expand_path('.', __dir__)
require 'run_k6'
require 'semantic'

module TestInfo
  extend self

  # Utility
  def get_test_tag_value(test_file, tag)
    File.open(test_file, "r") do |test_file_content|
      test_file_content.each_line do |line|
        return line.match(/@#{tag}: (.*)\n/)[1] if line.match?(/@#{tag}:/)
      end
    end

    nil
  end

  # Get

  def get_tests_info(test_files)
    test_files = test_files.split(',') if test_files.instance_of?(String)
    info_list = []

    test_files.each do |test_file|
      info = {}
      info.default = nil

      info[:name] = File.basename(test_file, '.js')
      info[:type] = test_file.split("/")[-2]
      info[:link] = "https://gitlab.com/gitlab-org/quality/performance/blob/master/k6/tests/#{info[:type]}/#{info[:name]}.js"
      info[:link_md] = "[#{info[:name]}](#{info[:link]})"

      info[:description] = get_test_tag_value(test_file, 'description')
      info[:endpoint] = get_test_tag_value(test_file, 'endpoint') || 'No documentaion'
      info[:issues] = get_test_tag_value(test_file, 'issue')
      info[:gitlab_version] = get_test_tag_value(test_file, 'gitlab_version')
      info[:flags] = get_test_tag_value(test_file, 'flags')

      info_list << info
    end

    info_list
  end

  # Check

  def test_has_unsafe_requests?(test_file)
    return true if get_test_tag_value(test_file, 'flags')&.include?('unsafe')

    write_methods = %w[post put del patch]
    File.open(test_file, "r") do |test_file_content|
      test_file_content.each_line do |line|
        line_has_write_method = write_methods.any? { |write_method| line.include?("http.#{write_method}") }
        return true if line_has_write_method
      end
    end

    false
  end

  def test_supported_by_version?(test_file, gitlab_version_string)
    test_version = nil
    gitlab_version = Semantic::Version.new(gitlab_version_string.match(/\d+\.\d+\.\d+/)[0])

    File.open(test_file, "r") do |test_file_content|
      test_file_content.each_line do |line|
        test_version = Semantic::Version.new(line.match(/@gitlab_version: (\d+\.\d+\.\d+)/)[1]) if line.match?(/@gitlab_version: (\d+\.\d+\.\d+)/)
      end
    end
    test_supported_by_version = true unless test_version && gitlab_version < test_version

    warn Rainbow("Test '#{File.basename(test_file)}' isn't supported by GitLab version '#{gitlab_version}'. Requires '#{test_version}' and up. Skipping...").yellow unless test_supported_by_version
    test_supported_by_version
  end
end
