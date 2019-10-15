/*global __ENV : true  */

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, adjustRps, getRpsThresholds } from "./modules/custom_k6_modules.js";

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

export let projectNames = __ENV.PROJECT_NAME.split(',');

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Git - Refs List", function() {
    let projectName = projectNames[Math.floor(Math.random() * projectNames.length)];

    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${__ENV.PROJECT_GROUP}/${projectName}.git/info/refs?service=git-upload-pack`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
