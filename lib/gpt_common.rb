require 'http'
require 'json'

module GPTCommon
  extend self

  def make_http_request(method: 'get', url: nil, params: {}, headers: {}, body: "", show_response: false, fail_on_error: true)
    raise "URL not defined for making request. Exiting..." unless url

    res = body.empty? ? HTTP.follow.method(method).call(url, form: params, headers: headers) : HTTP.follow.method(method).call(url, body: body, headers: headers)

    if show_response
      if res.content_type.mime_type == "application/json"
        res_body = JSON.parse(res.body.to_s)
        pp res_body
      else
        res_body = res.body.to_s
        puts res_body
      end
    end

    raise "#{method.upcase} request failed!\nCode: #{res.code}\nResponse: #{res.body}\n" if fail_on_error && !res.status.success?

    res
  end
end
