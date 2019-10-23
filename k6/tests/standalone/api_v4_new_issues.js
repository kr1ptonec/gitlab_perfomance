/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/issues`
@description: Setup stage: Create group and project <br>Test: [Creates a new project issue](https://docs.gitlab.com/ee/api/issues.html#new-issue) <br>Teardown stage: Delete group
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds } from "../modules/custom_k6_modules.js";

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

  let groupId = createGroup();
  let projectId = CreateProject(groupId)
  let data = { groupId, projectId };
  return data;
}

export default function (data) {
  group("API - Issue create", function () {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let formdata = { title: `issue-${__VU}-${__ITER}` };
    let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/issues`, formdata, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}

export function teardown(data) {
  deleteGroup(data.groupId);
}

function createGroup() {
  let groupName = "group-api-v4-new-issues";
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
    name: `project-api-v4-new-issues`,
    namespace_id: groupId,
    visibility: "public"
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
