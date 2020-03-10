/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/commits/:branch`
@description: Web - Project Commits Page. <br>Controllers: `CommitsController#show`</br>
@flags: repo_storage
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 1
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = __ENV.ENVIRONMENT_REPO_STORAGE == "nfs" ? getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT * 0.5, endpointCount) : getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT, endpointCount)
export let ttfbThreshold = __ENV.ENVIRONMENT_REPO_STORAGE == "nfs" ? getTtfbThreshold(3000) : getTtfbThreshold()
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:commits}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:commits}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getProjects(['name', 'group', 'branch']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Project Commits Page", function() {
    let project = selectProject(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/commits/master`, null, {tags: {endpoint: 'commits', controller: 'Projects::CommitsController', action: 'show'}}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
