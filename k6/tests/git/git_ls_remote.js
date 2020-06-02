/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-upload-pack`
@description: Git Refs List via HTTPS. <br>Controllers: `Repositories::GitHttpController#info_refs`</br>
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";

export let gitProtoRps = adjustRps(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let gitProtoStages = adjustStageVUs(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold()
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: gitProtoRps,
  stages: gitProtoStages
};

export let projects = getLargeProjects(['name', 'group']);

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Git - Get Refs List", function() {
    let project = selectRandom(projects);

    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}.git/info/refs?service=git-upload-pack`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
