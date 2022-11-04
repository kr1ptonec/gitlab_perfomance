/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/blame/master/:file_path`
@example_uri: /:unencoded_path/blame/master/:file_blame_path
@description: Web - Project File Blame Page. <br>Controllers: `Projects::BlameController#show`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/220950
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/217572, https://gitlab.com/gitlab-org/gitlab/-/issues/225174
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'rps': { '13.1.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.01, '15.2.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.01, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.2 },
  'ttfb': { '13.1.0': 20000, '15.2.0': 7000, 'latest': 2400 }
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
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'unencoded_path', 'file_blame_path']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Check if endpoint path has a dash \ redirect
  let checkProject = selectRandom(projects)
  let endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, `blame/master/${checkProject['file_blame_path']}`)
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}

export default function(data) {
  group("Web - Project File Blame Page", function() {
    let project = selectRandom(projects);
    let params = { tags: { endpoint: 'blame', controller: 'Projects::BlameController', action: 'show' }, responseType: 'none', redirects: 0 };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
