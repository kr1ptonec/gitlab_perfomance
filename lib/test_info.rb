$LOAD_PATH.unshift File.expand_path('.', __dir__)
require 'run_k6'
require 'semantic'

module TestInfo
  extend self

  def get_known_issues(k6_dir)
    tests = RunK6.get_tests(k6_dir: k6_dir, test_paths: ["tests"], quarantined: true, scenarios: true, read_only: false)

    aggregated_issues = []
    tests.each do |test|
      parsed_test = parse_test_docs_for_issues(test)
      aggregated_issues << parsed_test unless parsed_test.empty?
    end
    aggregated_issues
  end

  def parse_test_docs_for_issues(test_file)
    docs = {}
    test_filename = File.basename(test_file)

    File.open(test_file, "r") do |test_file_content|
      test_file_content.each_line do |line|
        case line
        when /@issue/
          match = line.match(/@issue: (.*)\n/)
          docs[:test] = test_filename
          docs[:issue] = match[1]
        end
      end
    end
    docs
  end

  def parse_test_docs_for_info(test_file)
    docs = {}
    test_filename = File.basename(test_file)
    test_type = test_file.split("/")[-2] # folder name is type
    test_repo_url = "https://gitlab.com/gitlab-org/quality/performance/blob/master/k6/tests/#{test_type}/#{test_filename}"
    docs[:test] = "[#{test_filename}](#{test_repo_url})"

    File.open(test_file, "r") do |test_file_content|
      test_file_content.each_line do |line|
        case line
        when /@endpoint/
          match = line.match(/@endpoint: (.*)\n/)
          docs[:endpoint] = match[1].tr('`', '_')
        when /@description/
          match = line.match(/@description: (.*)\n/)
          docs[:description] = match[1]
        end
      end
    end
    docs[:endpoint] = 'No documentaion' if docs[:endpoint].nil?
    docs[:type] = test_type
    docs
  end

  def test_is_read_only?(test_file)
    read_only = true
    write_methods = %w[post put del patch]
    File.open(test_file, "r") do |test_file_content|
      test_file_content.each_line do |line|
        line_has_write_method = write_methods.any? { |write_method| line.include?("http.#{write_method}") }
        read_only = false if line_has_write_method
      end
    end
    read_only
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
