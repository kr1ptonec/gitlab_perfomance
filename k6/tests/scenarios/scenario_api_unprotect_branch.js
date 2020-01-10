/* global __ENV, __VU, __ITER */
/*
@endpoint: `DELETE /projects/:id/protected_branches/:branch`
@description: [Unprotects the given protected branch or wildcard protected branch](https://docs.gitlab.com/ee/api/protected_branches.html#unprotect-repository-branches)
@issue: https://gitlab.com/gitlab-org/gitlab/issues/39169
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate, Trend } from "k6/metrics";
import { logError, getRpsThresholds, adjustRps, adjustStageVUs } from "../../lib/k6_test_modules.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not been set. Skipping...')

var unprotectTrend = new Trend("unprotect_branch_duration");

// RPS and Success Rate are adjusted to mitigate issues with protect/unprotect request conflitcs
export let unprotectRps = adjustRps();
export let unprotectStages = adjustStageVUs();
export let rpsThresholds = getRpsThresholds();
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  stages: unprotectStages,
  rps: unprotectRps
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = createGroup();
  let projectId = CreateProject(groupId)
  let data = { groupId, projectId };
  return data;
}

export default function(data) {
  group("API - Unprotect Protected Branch", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };

    let branchName = `protected-test-branch-${__VU}-${__ITER}`
    console.log(`creating branch ${branchName} in project ${data.projectId}`)
    let createBranchRes = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/repository/branches`, { branch: branchName, ref: "master" }, params);
    /20(0|1|4)/.test(createBranchRes.status) ? successRate.add(true) : successRate.add(false) && logError(createBranchRes);

    console.log(`protecting branch ${branchName} in project ${data.projectId}`)
    let protectRes = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/protected_branches`, { name: branchName }, params);
    /20(0|1|4)/.test(protectRes.status) ? successRate.add(true) : successRate.add(false) && logError(protectRes);

    console.log(`unprotecting branch ${branchName} in project ${data.projectId}`)
    let unprotectRes = http.del(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/protected_branches/${branchName}`, undefined, params);
    /20(0|1|4)/.test(unprotectRes.status) ? successRate.add(true) : successRate.add(false) && logError(unprotectRes);
    unprotectTrend.add(unprotectRes.timings.duration);
  });
}
export function teardown(data) {
  deleteGroup(data.groupId);
}

function createGroup() {
  let groupName = "group-api-v4-unprotect-branch";
  let groupId = searchForGroup(groupName);
  if (groupId) { deleteGroup(groupId) }

  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata = {
    name: `${groupName}-${Date.now()}`,
    path: `${groupName}-${Date.now()}`,
    visibility: "public"
  };
  let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/groups`, formdata, params);
  groupId = JSON.parse(res.body)['id'];
  /20(0|1)/.test(res.status) ? console.log(`Group #${groupId} was created`) : fail("Group was not created") && logError(res);
  return groupId;
}

function CreateProject(groupId) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata = {
    name: `project-api-v4-unprotect-branch`,
    namespace_id: groupId,
    visibility: "public",
    initialize_with_readme: true
  };
  let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects`, formdata, params);
  let projectId = JSON.parse(res.body)['id'];
  /20(0|1)/.test(res.status) ? console.log(`Project #${projectId} was created`) : fail("Project was not created") && logError(res);
  return projectId;
}

function deleteGroup(groupId) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.del(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${groupId}`, undefined, params);
  (res.status == "202") ? console.log(`Group #${groupId} was deleted`) : logError(res);
}

function searchForGroup(groupName) {
  let params = { headers: { "Accept": "application/json" } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups?search=${groupName}`, params);
  let foundGroup = JSON.parse(res.body)[0];
  let groupId = foundGroup && foundGroup.id;  
  groupId ? console.log(`Group contaning '${groupName}' name already exists with id=${groupId}`) : console.log(`No groups containing name: '${groupName}'`);
  return groupId;
}
