require 'gpt_common'
require 'uri'

module InfluxDB
  extend self

  def healthy?(influxdb_host)
    GPTCommon.make_http_request(method: 'get', url: URI.join(influxdb_host, "ping?verbose=true").to_s, fail_on_error: false).status.success?
  rescue HTTP::ConnectionError, Errno::ECONNREFUSED
    false
  end

  def prepare_request_body(measurement, tags, value, time)
    # https://docs.influxdata.com/influxdb/v1.7/guides/writing_data/#write-data-using-the-influxdb-api
    "#{measurement},#{tags.map { |h| h.join '=' }.join ','} value=#{value} #{time}"
  end

  def prepare_request_data(results_json)
    tests_end_time = results_json['time']['end_epoch'] * 1_000_000 # The timestamp for InfluxDB data point in nanosecond-precision Unix time.
    tags = {
      gitlab_version: results_json['version'],
      gitlab_revision: results_json['revision'],
      gpt_version: results_json['gpt_version']
    }
    results_json['test_results'].map do |test_result|
      measurements = %w[ttfb_avg ttfb_p90 ttfb_p95 rps_result success_rate score]
      measurements.map do |measurement|
        prepare_request_body(measurement, tags.merge({ test_name: test_result['name'] }), test_result[measurement], tests_end_time)
      end.join("\n")
    end.join("\n")
  end

  def write_data(influxdb_url, results_json)
    return false, "Invalid URL" unless influxdb_url.match?(URI::DEFAULT_PARSER.make_regexp)

    influxdb_host = influxdb_url.match(/(.*)\//)[1]
    influxdb_db = influxdb_url.split("/")[-1]
    influxdb_write_url = URI.join(influxdb_host, "/write?db=#{influxdb_db}").to_s

    return false, "URL can’t be reached" unless healthy?(influxdb_host)

    body = prepare_request_data(results_json)
    GPTCommon.make_http_request(method: 'post', url: influxdb_write_url, body: body, fail_on_error: false)
  end
end
