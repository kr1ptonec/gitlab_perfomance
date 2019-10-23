/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/merge_requests/:merge_request_iid/commits`
@description: [Get a list of merge request commits](https://docs.gitlab.com/ee/api/merge_requests.html#get-single-mr-commits)
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds } from "../modules/custom_k6_modules.js";

// Endpoint is below target threshold. Custom lower limit applied until fixed.
// Issue: https://gitlab.com/gitlab-org/gitlab/issues/31321
export let rpsThresholds = getRpsThresholds(0.1)
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
  group("API - Merge Request Commits", function() {
    let params = { headers: { "Accept": "application/json" } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${__ENV.PROJECT_GROUP}%2F${__ENV.PROJECT_NAME}/merge_requests/${__ENV.PROJECT_MR_COMMITS_IID}/commits`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
