/*global __ENV : true  */
/*
@endpoint: `GET /`
@description: Web - Homepage. <br>Controllers: `RootController#index`</br>
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";

export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold()
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages,
  maxRedirects: 1,
  setupTimeout: '30s'
};

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let gitlabSessionCookie = getGitlabSessionCookie();
  return gitlabSessionCookie;
}

export default function(cookie) {
  group("Web - Groups Page", function() {
    let params = { cookies: { _gitlab_session: cookie } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/dashboard`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}

export function getGitlabSessionCookie() {
  let params = { headers: { "Accept": "application/json" } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/users/sign_in`);
  let token = res.body.split("name=\"csrf-token\" content=\"")[1].split("\" />")[0];

  let formdata = {
    'user[login]': __ENV.USERNAME,
    'user[password]': __ENV.PASSWORD,
    authenticity_token: token
  };

  let signInResponse = http.post(`${__ENV.ENVIRONMENT_URL}/users/sign_in`, formdata, params);
  let gitlabSessionCookie = signInResponse.cookies._gitlab_session[0].value
  return gitlabSessionCookie;
}
