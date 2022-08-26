module ResultWriter
  class Base
    attr_reader :path

    def initialize(results_dir, file_prefix)
      ext = self.class.name.split('::').last.downcase
      @path = File.join(results_dir, "#{file_prefix}_results.#{ext}")
    end
  end

  class Json < Base
    def write(results)
      File.write(path, results.to_json)
    end
  end

  class Csv < Base
    require 'csv'

    def write(results)
      CSV.open(path, "wb") do |csv|
        csv << ["Name", "RPS", "RPS Result", "RPS Threshold", "TTFB Avg (ms)", "TTFB P90 (ms)", "TTFB P90 Threshold (ms)", "TTFB P95 (ms)", "Req Status", "Req Status Threshold", "Result"]
        results['test_results'].each do |test_result|
          csv << [
            test_result['name'],
            test_result['rps_target'],
            test_result['rps_result'],
            test_result['rps_threshold'],
            test_result['ttfb_avg'],
            test_result['ttfb_p90'],
            test_result['ttfb_p90_threshold'],
            test_result['ttfb_p95'],
            test_result['ws_connect_avg'],
            test_result['ws_connect_p90'],
            test_result['success_rate'],
            test_result['success_rate_threshold'],
            test_result['result'] ? "Passed" : "FAILED"
          ]
        end
      end
    end
  end

  class Txt < Base
    require 'table_print'

    class Sections
      def generate(results)
        {
          summary: generate_results_summary(results),
          table: generate_results_table(results),
          footer: generate_results_footer(results)
        }
      end

      private

      def generate_results_summary(results)
        results_summary = <<~DOC
          * Environment:                #{results['name'].capitalize}
          * Environment Version:        #{results['version']} `#{results['revision']}`
          * Option:                     #{results['option']}
          * Date:                       #{results['date']}
          * Run Time:                   #{ChronicDuration.output(results['time']['run'], format: :short, keep_zero: true)} (Start: #{results['time']['start']}, End: #{results['time']['end']})
          * GPT Version:                v#{results['gpt_version']}
        DOC
        results_summary += "\n❯ Overall Results Score: #{results['overall_result_score']}%\n" unless results['overall_result_score'].nil?
        results_summary
      end

      def generate_results_table(results)
        tp_results = results['test_results'].map do |test_result|
          tp_result = {}

          tp_result["Name"] = test_result['name'] || '-'
          tp_result["RPS"] = test_result['rps_target'] ? "#{test_result['rps_target']}/s" : '-'
          tp_result["RPS Result"] = [test_result['rps_result'], test_result['rps_threshold']].none?(&:nil?) ? "#{test_result['rps_result']}/s (>#{test_result['rps_threshold']}/s)" : '-'
          tp_result["WS Connect Avg"] = "#{test_result['ws_connect_avg']}ms" if test_result['ws_connect_avg']
          tp_result["WS Connect P90"] = "#{test_result['ws_connect_p90']}ms" if test_result['ws_connect_p90']
          tp_result["TTFB Avg"] = test_result['ttfb_avg'] ? "#{test_result['ttfb_avg']}ms" : '-'
          tp_result["TTFB P90"] = [test_result['ttfb_p90'], test_result['ttfb_p90_threshold']].none?(&:nil?) ? "#{test_result['ttfb_p90']}ms (<#{test_result['ttfb_p90_threshold']}ms)" : '-'
          tp_result["TTFB P95"] = "#{test_result['ttfb_p95']}ms" if ENV['GPT_TTFB_P95']
          tp_result["Req Status"] = [test_result['success_rate'], test_result['success_rate_threshold']].none?(&:nil?) ? "#{test_result['success_rate']}% (>#{test_result['success_rate_threshold']}%)" : '-'

          test_result_str = test_result['result'] ? "Passed" : "FAILED"
          test_result_str << '¹' unless test_result['issues'].nil?
          test_result_str << '²' unless test_result['result']
          tp_result["Result"] = test_result['result'] ? Rainbow(test_result_str).green : Rainbow(test_result_str).red

          tp_result
        end

        tp.set(:max_width, 60)
        TablePrint::Printer.table_print(tp_results)
      end

      def generate_results_footer(results)
        footer = ''
        footer << "\n¹ Result covers endpoint(s) that have known issue(s). Threshold(s) have been adjusted to compensate." if results['test_results'].any? { |test_result| test_result['issues'] }
        footer << "\n² Failure may not be clear from summary alone. Refer to the individual test's full output for further debugging." unless results['overall_result']
        footer
      end
    end

    def write(results)
      sections = Sections.new.generate(results)
      summary, table, footer = sections.values_at(:summary, :table, :footer)
      # Write results to file but also remove any terminal ANSI codes
      File.write(path, "#{summary}\n#{table}\n#{footer}".gsub(/\e\[([;\d]+)?m/, ''))

      puts "\n█ Results summary\n\n#{summary}\n"
      puts table
      puts Rainbow(footer).italic unless footer.empty?
    end
  end
end
