/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/repository/branches`
@description: [Create a new branch in the repository](https://docs.gitlab.com/ee/api/branches.html#create-repository-branch)
@issue: https://gitlab.com/gitlab-org/gitlab/issues/196788
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { createGroup, CreateProject, deleteGroup } from "../../lib/gpt_scenario_functions.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not been set. Skipping...')

export let rps = adjustRps(0.05);
export let stages = adjustStageVUs(0.05);
export let rpsThresholds = getRpsThresholds(0.05);
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  stages: stages,
  rps: rps
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = createGroup("group-api-v4-create-branch", __ENV.ENVIRONMENT_URL);
  let projectId = CreateProject(groupId, __ENV.ENVIRONMENT_URL)
  let data = { groupId, projectId };
  return data;
}

export default function(data) {
  group("API - Create New Branch", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };

    let branchName = `test-branch-${__VU}-${__ITER}`
    let createBranchRes = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/repository/branches`, { branch: branchName, ref: "master" }, params);
    /20(0|1|4)/.test(createBranchRes.status) ? successRate.add(true) : successRate.add(false) && logError(createBranchRes);
  });
}
export function teardown(data) {
  deleteGroup(data.groupId, __ENV.ENVIRONMENT_URL);
}
