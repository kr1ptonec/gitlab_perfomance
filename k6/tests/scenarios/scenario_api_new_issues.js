/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/issues`
@description: Setup stage: Create group and project <br>Test: [Creates a new project issue](https://docs.gitlab.com/ee/api/issues.html#new-issue) <br>Teardown stage: Delete group
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { createGroup, CreateProject, deleteGroup } from "../../lib/gpt_scenario_functions.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not been set. Skipping...')

export let issueRps = adjustRps(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let issueStages = adjustStageVUs(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold(2500)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  stages: issueStages,
  rps: issueRps
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = createGroup("group-api-v4-new-issues");
  let projectId = CreateProject(groupId)
  let data = { groupId, projectId };
  return data;
}

export default function (data) {
  group("API - Issue create", function () {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let formdata = { title: `issue-${__VU}-${__ITER}` };
    let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/issues`, formdata, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}

export function teardown(data) {
  deleteGroup(data.groupId);
}
