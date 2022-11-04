/* global __ENV */
/*
@endpoint: `GET /projects/:id/variables`
@description: Setup stage: Create group, project and multiple project variables <br>Test: [List project variables](https://docs.gitlab.com/ee/api/project_level_variables.html#list-project-variables) <br>Teardown stage: Delete group
@gpt_data_version: 1
@flags: unsafe
*/

import http from "k6/http";
import { fail, group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { searchAndCreateGroup, createProject, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let rps = adjustRps(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let stages = adjustStageVUs(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold()
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

  let groupId = searchAndCreateGroup("project-api-v4-list-variables");
  let projectId = createProject(groupId, { builds_access_level: "enabled" });
  createProjectVariables(projectId, 20)
  let data = { groupId, projectId };
  return data;
}

export default function (data) {
  group("API - List Project Variables", function () {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, tags: { endpoint: 'project_variables' } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${data.projectId}/variables`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}

export function teardown(data) {
  deleteGroup(data.groupId);
}

function createProjectVariables(projectId, count) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };

  for (let i = 1; i <= count; i++) {
    let formdata = {
      key: `project_var_${i}_key`,
      value: `project_var_${i}_value`,
      'protected': false,
      'masked': false };

    let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}/variables`, formdata, params);
    /20(0|1)/.test(res.status) ? console.debug(`Project variable ${i} in project with id #${projectId} was created`) : (logError(res), fail(`Project variable ${i} was not created`));
  }
}
