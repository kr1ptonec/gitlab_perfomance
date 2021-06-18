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
      info[:example_uri] = get_test_tag_value(test_file, 'example_uri')
      info[:issues] = get_test_tag_value(test_file, 'issue')
      info[:gitlab_version] = get_test_tag_value(test_file, 'gitlab_version')
      info[:flags] = get_test_tag_value(test_file, 'flags')
      info[:gitlab_settings] = get_test_tag_value(test_file, 'gitlab_settings')
      info[:gpt_data_version] = get_test_tag_value(test_file, 'gpt_data_version')

      info_list << info
    end

    info_list
  end

  def get_test_urls(tests_info, env_vars)
    env_url = env_vars['ENVIRONMENT_URL']
    large_project = JSON.parse(env_vars['ENVIRONMENT_LARGE_PROJECTS']).first
    horizontal_data = JSON.parse(env_vars['ENVIRONMENT_MANY_GROUPS_AND_PROJECTS'])
    additional_data = { "environment_root_group" => env_vars['ENVIRONMENT_ROOT_GROUP'], "user" => env_vars['ENVIRONMENT_USER'] }
    test_data = large_project.merge(horizontal_data, additional_data)

    tests_info.each do |test_info|
      if test_info[:example_uri].nil?
        test_info[:url] = ''
        next
      elsif !test_info[:example_uri].include?(':')
        test_info[:url] = "#{env_url}#{test_info[:example_uri]}"
        next
      end

      # Substitute all options like `:encoded_path` with test data from target env
      endpoint = test_info[:example_uri].gsub(/(\/|=):(\w+)/) do |match|
        test_option = match.gsub(/[^0-9A-Za-z_]/, '')
        if test_data[test_option].nil?
          test_info[:example_uri] = nil
          next
        else
          "/#{test_data[test_option]}"
        end
      end
      test_info[:url] = test_info[:example_uri].nil? ? '' : "#{env_url}#{endpoint}"
    end
    tests_info
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

  def test_supported_by_gitlab_version?(test_file, gitlab_version)
    test_supported_version = get_test_tag_value(test_file, 'gitlab_version')
    return true if test_supported_version.nil?

    if test_supported_version && gitlab_version == '-'
      warn Rainbow("GitLab version wasn't able to be determined. Test '#{File.basename(test_file)}' requires GitLab version '#{test_supported_version}' and up. Check that the environment is accessible and the ACCESS_TOKEN provided is correct then try again. Skipping out of caution...").yellow
      return false
    end

    gitlab_version = Semantic::Version.new(gitlab_version.match(/\d+\.\d+\.\d+/)[0])
    if test_supported_version && gitlab_version < Semantic::Version.new(test_supported_version)
      warn Rainbow("Test '#{File.basename(test_file)}' isn't supported by target GitLab environment version '#{gitlab_version}'. Requires '#{test_supported_version}' and up. Skipping...").yellow
      return false
    end

    true
  end

  def test_supported_by_gitlab_settings?(test_file, gitlab_settings)
    test_required_settings = get_test_tag_value(test_file, 'gitlab_settings')
    return true if test_required_settings.nil?
    return false if gitlab_settings.empty? || gitlab_settings.nil?

    JSON.parse(test_required_settings).each do |setting, value|
      if gitlab_settings[setting] != value
        warn Rainbow("Test '#{File.basename(test_file)}' isn't supported by target GitLab environment due to required environment setting '#{setting}' not being set to '#{value}'. Skipping...").yellow
        return false
      end
    end

    true
  end

  def test_supported_by_gpt_data?(test_file, gpt_data_version)
    test_required_gpt_data = get_test_tag_value(test_file, 'gpt_data_version')
    return false if test_required_gpt_data.nil? || test_required_gpt_data.empty?

    if test_required_gpt_data && gpt_data_version == '-'
      warn Rainbow("GPT test data version wasn't able to be determined. Test '#{File.basename(test_file)}' requires GPT test data version '#{test_required_gpt_data}' and up. Check that the test data was setup correctly using the GPT Data Generator.\nIf you are running against a custom large project please disable this version check by adding `\"skip_check_version\": \"true\"` under `gpt_data` in Environment Config file.\nSkipping...").yellow
      return false
    end

    if test_required_gpt_data > gpt_data_version
      warn Rainbow("Test '#{File.basename(test_file)}' isn't supported by GPT test data version '#{gpt_data_version}' on the target GitLab environment. Requires '#{test_required_gpt_data}' and up. Please update test data using the latest GPT Data Generator. Skipping...").yellow
      return false
    end

    true
  end
end
