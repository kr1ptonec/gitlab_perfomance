/*global __ENV : true  */
/*
@endpoint: `GET /projects?order_by=id&sort=asc`
@description: [Get a list of all projects owned by user](https://docs.gitlab.com/ee/api/projects.html#list-all-projects)
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/30181, https://gitlab.com/gitlab-org/gitlab/-/issues/211495
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold } from "../../lib/gpt_k6_modules.js";

export let rpsThresholds = getRpsThresholds(0.05)
export let ttfbThreshold = getTtfbThreshold(11000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Projects List", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects?order_by=id&sort=asc&owned=true`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
