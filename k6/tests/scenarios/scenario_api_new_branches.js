/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/repository/branches`
@description: [Create a new branch in the repository](https://docs.gitlab.com/ee/api/branches.html#create-repository-branch)
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/196788
@flags: unsafe
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError } from "../../lib/gpt_k6_modules.js";
import { getDuration, getRps, getRpsThreshold, getScenario, getTtfbThreshold, } from "../../lib/gpt_test_config.js";
import { createGroup, createProject, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let duration = getDuration()
export let rps = getRps('scenario')
export let rpsThreshold = getRpsThreshold('scenario')
export let scenario = getScenario('scenario')
export let ttfbThreshold = getTtfbThreshold(1500)
export let successRate = new Rate("successful_requests")
export let options = {
  scenarios: scenario,
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`rate>=${rpsThreshold}`],
    "http_reqs{endpoint:branches}": [`rate>=${rpsThreshold}`],
  }
};

export function setup() {
  console.log(`Duration: ${duration}`)
  console.log(`Scenario Protocol RPS: ${rps}`)
  console.log(`RPS Threshold: ${rpsThreshold}/s`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = createGroup("group-api-v4-create-branch");
  let projectId = createProject(groupId);
  let data = { groupId, projectId };
  return data;
}

export default function(data) {
  group("API - Create New Branch", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, tags: { endpoint: 'branches' } };

    let branchName = `test-branch-${__VU}-${__ITER}`
    let createBranchRes = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/repository/branches`, { branch: branchName, ref: "master" }, params);
    /20(0|1|4)/.test(createBranchRes.status) ? successRate.add(true) : successRate.add(false) && logError(createBranchRes);
  });
}
export function teardown(data) {
  deleteGroup(data.groupId, __ENV.ENVIRONMENT_URL);
}
