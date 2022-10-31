/*global __ENV : true  */
/*
@endpoint: `GET /groups/:id/merge_requests`
@example_uri: /api/v4/groups/:environment_root_group/merge_requests
@description: [List groups merge requests](https://docs.gitlab.com/ee/api/merge_requests.html#list-group-merge-requests)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/301204, https://gitlab.com/gitlab-org/gitlab/-/issues/377515
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { 'latest': 0.1 },
  'ttfb': { 'latest': 17500 },
};
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
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
  group("API - Group Merge Requests List", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${__ENV.ENVIRONMENT_ROOT_GROUP}/merge_requests`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
