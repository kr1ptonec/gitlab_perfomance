$LOAD_PATH.unshift File.expand_path('.', __dir__)
require 'run_k6'

module TestInfo
  def self.get_known_issues(k6_dir)
    tests = RunK6.get_tests(k6_dir: k6_dir, test_paths: ["tests"], quarantined: true, scenarios: true, custom: true)

    aggregated_issues = []
    tests.each do |test|
      parsed_test = parse_test_docs_for_issues(test)
      aggregated_issues << parsed_test unless parsed_test.empty?
    end
    aggregated_issues
  end

  def self.parse_test_docs_for_issues(test_file)
    docs = {}
    test_filename = File.basename(test_file)

    test_file_content = File.open(test_file, "r")
    test_file_content.each_line do |line|
      case line
      when /@issue/
        match = line.match(/@issue: (.*)\n/)
        docs[:test] = test_filename
        docs[:issue] = match[1]
      end
    end
    test_file_content.close
    docs
  end

  def self.parse_test_docs_for_info(test_file)
    docs = {}
    test_filename = File.basename(test_file)
    test_type = test_file.split("/")[-2] # folder name is type
    test_repo_url = "https://gitlab.com/gitlab-org/quality/performance/blob/master/k6/tests/#{test_type}/#{test_filename}"
    docs[:test] = "[#{test_filename}](#{test_repo_url})"

    test_file_content = File.open(test_file, "r")
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
    test_file_content.close
    docs[:endpoint] = 'No documentaion' if docs[:endpoint].nil?
    docs[:type] = test_type
    docs
  end
end
