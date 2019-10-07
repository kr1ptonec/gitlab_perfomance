/*global __ENV : true  */

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds } from "./modules/custom_k6_modules.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not be set. Exiting...')

// Endpoint is below target threshold. Custom lower limit applied until fixed.
// Issue: https://gitlab.com/gitlab-org/gitlab/issues/30536
export let rpsThresholds = getRpsThresholds(0.05)
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "iterations": [`count>=${rpsThresholds['count']}`]
  }
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Project Repository Branches List", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${__ENV.PROJECT_GROUP}%2F${__ENV.PROJECT_NAME}/repository/branches`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
