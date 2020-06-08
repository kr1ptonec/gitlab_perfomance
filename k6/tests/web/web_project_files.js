/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/tree/master`
@description: Web - Project Files Tree. <br>Controllers: `Projects::TreeController#show`, `Projects::BlobController#show.json`, `Projects::RefsController#logs_tree.json`</br>
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/211366
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 6
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT * 0.75, endpointCount)
export let ttfbThreshold = getTtfbThreshold(2500)
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

export let projects = getLargeProjects(['name', 'group_path_web', 'dir_path']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Project Files Tree", function() {
    let project = selectRandom(projects);

    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/tree/master/${project['dir_path']}`, {tags: {endpoint: 'tree', controller: 'Projects::TreeController', action: 'show'}});
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));

    let logsTreeRes = null
    for (let i = 0; i <= 100; i+=25) {
      logsTreeRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/refs/master/logs_tree/${project['dir_path']}?format=json&offset=${i}`, {tags: {endpoint: 'logs_tree', controller: 'Projects::RefsController', action: 'logs_tree.json'}});
      /20(0|1)/.test(logsTreeRes.status) ? successRate.add(true) : (successRate.add(false), logError(logsTreeRes));
    }
  });
}
