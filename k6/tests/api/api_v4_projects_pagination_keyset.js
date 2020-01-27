/*global __ENV : true  */
/*
@endpoint: `GET /projects?pagination=keyset&order_by=id&sort=asc`
@description: [Get a list of all visible projects across GitLab for the authenticated user using keyset-pagination](https://docs.gitlab.com/ee/api/projects.html#list-all-projects)
@gitlab_version: 12.7.0
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds } from "../../lib/gpt_k6_modules.js";

export let rpsThresholds = getRpsThresholds()
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Projects List", function() {
    let params = { headers: { "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects?order_by=id&sort=asc&pagination=keyset`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}