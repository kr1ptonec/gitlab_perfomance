require 'logger'

module GPTLogger
  singleton_class.module_eval do
    attr_writer :logger

    def logger(only_to_file: false)
      @logger ||= Logger.new(ENV['GPT_LOGGER_PATH'] || STDOUT)
      @logger.formatter = proc do |severity, datetime, progname, msg|
        date_format = datetime.strftime("%Y-%m-%d %H:%M:%S")
        puts msg unless only_to_file
        if ENV['GPT_LOGGER_PATH']
          # Write to file and output to console. TODO Refactor regex below - it removes ANSI color codes
          msg = msg.is_a?(String) ? msg.gsub(/\e\[(\d+)m/, '').gsub(/\e\[(\d+;\d+;\d+)m/, '') : msg
          "[#{date_format}] #{severity}: #{msg}\n"
        end
      end
      @logger
    end
  end
end
