/* global __ENV */
/*
@endpoint: `PUT /projects/:id`
@description: Setup stage: Create a group with a project <br>Test: Update the project's name or path <br>Teardown stage: Delete the group with project
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/367562
@flags: unsafe
*/

import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, selectRandom } from "../../lib/gpt_k6_modules.js";
import { searchAndCreateGroup, deleteGroup, updateProject, createProject } from "../../lib/gpt_scenario_functions.js";

let actions = ['name', 'path'];

export let thresholds = {
  'ttfb': { 'latest': 1500 }
}
export let rps = adjustRps(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let stages = adjustStageVUs(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.SCENARIO_ENDPOINT_THROUGHPUT, actions.length)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")

let action_thresholds = {
  "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
  "http_reqs": [`count>=${rpsThresholds['count']}`]
}

actions.forEach(action => {
  action_thresholds[`http_req_waiting{action:${action}}`] = [`p(90)<${ttfbThreshold}`],
  action_thresholds[`http_reqs{action:${action}}`] = [`count>=${rpsThresholds['count_per_endpoint']}`]
})

export let options = {
  thresholds: action_thresholds,
  stages: stages,
  rps: rps
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Action: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${__ENV.SUCCESS_RATE_THRESHOLD*100}%`)

  let groupId = searchAndCreateGroup("group-api-v4-update-project");
  let projectId = createProject(groupId);
  let data = { groupId, projectId };
  return data;
}

export default function (data) {
  group("API - Update Project", function () {
    let newProjectNameOrPath = `project-api-v4-updated-${Date.now()}`;
    let actionToTest = selectRandom(actions);
    let formData = {};

    formData[actionToTest] = newProjectNameOrPath;

    let res = updateProject(data.projectId, formData, { action: actionToTest });
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}

export function teardown(data) {
  deleteGroup(data.groupId);
}
