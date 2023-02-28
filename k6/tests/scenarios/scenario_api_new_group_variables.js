/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /groups/:id/variables`
@description: Setup stage: Create group <br>Test: [Creates a new group variable](https://docs.gitlab.com/ee/api/group_level_variables.html#create-variable) <br>Teardown stage: Delete group
@gpt_data_version: 1
@flags: unsafe
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/386475
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { searchAndCreateGroup, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let thresholds = {
  'ttfb': { 'latest': 350 }
};
export let rps = adjustRps(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let stages = adjustStageVUs(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:group_variables}": [`count>=${rpsThresholds['count']}`],
  },
  stages: stages,
  rps: rps
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = searchAndCreateGroup("group-api-v4-new-variables");
  let data = { groupId };
  return data;
}

export default function (data) {
  group("API - Create New Group Variables", function () {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, tags: { endpoint: 'group_variables' } };
    let formdata = { key: `var_key_${__VU}_${__ITER}`, value: `var_value_${__VU}_${__ITER}`, 'protected': false, 'masked': false };
    let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${data.groupId}/variables`, formdata, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}

export function teardown(data) {
  deleteGroup(data.groupId);
}
