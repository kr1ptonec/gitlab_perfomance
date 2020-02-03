/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/tree/master`
@description: Web - Project Files Tree. <br>Controllers: `Projects::TreeController#show`, `Projects::BlobController#show.json`</br>
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, adjustRps, adjustStageVUs, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 2;
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THRESHOLD);
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THRESHOLD);
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THRESHOLD, endpointCount);
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:tree}": ["p(95)<500"],
    "http_req_waiting{endpoint:README.md}": ["p(95)<500"],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    'http_reqs{endpoint:tree}': [`count>=${rpsThresholds['count_per_endpoint']}`],
    'http_reqs{endpoint:README.md}': [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getProjects(['name', 'group']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Project Files Tree", function() {
    let project = selectProject(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/tree/master`, null, {tags: {endpoint: 'tree', controller: 'Projects::TreeController', action: 'show'}}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/blob/master/README.md?format=json&viewer=rich`, null, {tags: {endpoint: 'README.md', controller: 'Projects::BlobController', action: 'show.json'}}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
    });
  });
}
