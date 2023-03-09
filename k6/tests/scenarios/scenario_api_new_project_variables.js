/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/variables`
@description: Setup stage: Create group and project <br>Test: [Creates a new project variable](https://docs.gitlab.com/ee/api/project_level_variables.html#create-variable) <br>Teardown stage: Delete group
@gpt_data_version: 1
@flags: unsafe
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/386475
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { searchAndCreateGroup, createProject, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let thresholds = {
  'ttfb': { 'latest': 450 }
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
    "http_reqs{endpoint:project_variables}": [`count>=${rpsThresholds['count']}`],
  },
  stages: stages,
  rps: rps
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = searchAndCreateGroup("project-api-v4-new-variables");
  let projectId = createProject(groupId, { builds_access_level: "enabled" });
  let data = { groupId, projectId };
  return data;
}

export default function (data) {
  group("API - Create New Project Variables", function () {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, tags: { endpoint: 'project_variables' } };
    let formdata = { key: `var_key_${__VU}_${__ITER}`, value: `var_value_${__VU}_${__ITER}`, 'protected': false, 'masked': false };
    let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/variables`, formdata, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}

export function teardown(data) {
  deleteGroup(data.groupId);
}


