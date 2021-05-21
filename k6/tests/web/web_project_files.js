/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/tree/master`
@description: Web - Project Files Tree. <br>Controllers: `Projects::TreeController#show`, `Projects::BlobController#show.json`, `Projects::RefsController#logs_tree.json`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/211366
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/222685
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'rps': { '13.0.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.75, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT },
  'ttfb': { '13.0.0': 1000, 'latest': 800 }
};
export let endpointCount = 6
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:tree}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:logs_tree}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:tree}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:logs_tree}": [`count>=${rpsThresholds['count_per_endpoint']}`],
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'unencoded_path', 'dir_path']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Check if endpoint path has a dash \ redirect
  let checkProject = selectRandom(projects)
  let endpointPathTree = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, `tree/master/${checkProject['dir_path']}`)
  let endpointPathLogsTree = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, `refs/master/logs_tree/${checkProject['dir_path']}?format=json`)
  console.log(`Endpoint paths are '${endpointPathTree}' and '${endpointPathLogsTree}'`)
  return { endpointPathTree, endpointPathLogsTree };
}

export default function(data) {
  group("Web - Project Files Tree", function() {
    let project = selectRandom(projects);

    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPathTree}`, {tags: {endpoint: 'tree', controller: 'Projects::TreeController', action: 'show'}, redirects: 0});
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));

    let logsTreeRes = null
    for (let i = 0; i <= 100; i+=25) {
      logsTreeRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPathLogsTree}&offset=${i}`, {tags: {endpoint: 'logs_tree', controller: 'Projects::RefsController', action: 'logs_tree.json'}, redirects: 0});
      /20(0|1)/.test(logsTreeRes.status) ? successRate.add(true) : (successRate.add(false), logError(logsTreeRes));
    }
  });
}
