/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/repository/branches`
@description: Setup stage: Create group and project <br>Test: [Create a new branch in the repository](https://docs.gitlab.com/ee/api/branches.html#create-repository-branch) <br>Teardown stage: Delete group
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/196788
@flags: unsafe
*/

import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { createGroup, createProject, createBranch, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let rps = adjustRps(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let stages = adjustStageVUs(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold(1500)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:branches}": [`count>=${rpsThresholds['count']}`],
  },
  stages: stages,
  rps: rps
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = createGroup("group-api-v4-create-branch");
  let projectId = createProject(groupId);
  let data = { groupId, projectId };
  return data;
}

export default function(data) {
  group("API - Create New Branch", function() {
    let branchName = `test-branch-${__VU}-${__ITER}`;
    let createBranchRes = createBranch(data.projectId, branchName);
    /20(0|1|4)/.test(createBranchRes.status) ? successRate.add(true) : successRate.add(false) && logError(createBranchRes);
  });
}
export function teardown(data) {
  deleteGroup(data.groupId, __ENV.ENVIRONMENT_URL);
}
