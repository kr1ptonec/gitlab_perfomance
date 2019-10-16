/*global __ENV : true  */

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, adjustRps, selectProject } from "./modules/custom_k6_modules.js";

export let gitProtoRps = adjustRps(__ENV.GIT_ENDPOINT_THRESHOLD);
export let rpsThresholds = getRpsThresholds(__ENV.GIT_ENDPOINT_THRESHOLD);
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: gitProtoRps
};

export let projects = JSON.parse(open(`../environments/${__ENV.ENVIRONMENT_NAME}.json`))['projects'];

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Git - Refs List", function() {
    let project = selectProject(projects);

    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}.git/info/refs?service=git-upload-pack`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
