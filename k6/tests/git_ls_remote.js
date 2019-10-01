/*global __ENV : true  */

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds } from "./modules/custom_k6_modules.js";

export let gitProtocolTestModifier = 0.02
export let rpsThresholds = getRpsThresholds(gitProtocolTestModifier);
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: `${(parseFloat(__ENV.RPS_TARGET) * gitProtocolTestModifier).toFixed(0)}`
};

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${(parseFloat(__ENV.RPS_TARGET) * gitProtocolTestModifier).toFixed(0)}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Git - Refs List", function() {
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${__ENV.PROJECT_GROUP}/${__ENV.PROJECT_NAME}.git/info/refs?service=git-upload-pack`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
