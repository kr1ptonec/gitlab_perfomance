/*global __ENV : true  */
/*
@endpoint: `GET /groups/:id/subgroups`
@example_uri: /api/v4/groups/:encoded_group_path/subgroups
@description: [List a group’s subgroups](https://docs.gitlab.com/ee/api/groups.html#list-a-groups-subgroups)
@gpt_data_version: 1
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getManyGroupsOrProjects } from "../../lib/gpt_k6_modules.js";

export let rpsThresholds = getRpsThresholds()
export let ttfbThreshold = getTtfbThreshold()
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let horizDataGroup = getManyGroupsOrProjects(['encoded_group_path']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Group Details", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${horizDataGroup}/subgroups`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
