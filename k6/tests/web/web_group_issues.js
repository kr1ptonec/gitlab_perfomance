/*global __ENV : true  */
/*
@endpoint: `GET /groups/:group/issues`
@example_uri: /groups/:environment_root_group/-/issues
@description: Web - Group Issues Page. <br>Controllers: `GroupsController#issues`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/334439
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/353461
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'rps': { 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT },
  'ttfb': { 'latest': 500 }
};
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Check if endpoint path has a dash \ redirect
  let endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/groups/${__ENV.ENVIRONMENT_ROOT_GROUP}`, 'issues')
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}
export default function(data) {
  group("Web - Project Issues Page", function() {
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/groups/${__ENV.ENVIRONMENT_ROOT_GROUP}/${data.endpointPath}`, { redirects: 0 });
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
