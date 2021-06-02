/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/repository/commits`
@description: Setup stage: Create group and project <br>Test: [Create a commit with multiple files and actions](https://docs.gitlab.com/ee/api/commits.html#create-a-commit-with-multiple-files-and-actions) <br>Teardown stage: Delete group
@gpt_data_version: 1
@flags: unsafe
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { createGroup, createProject, createBranch, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let thresholds = {
  'ttfb': { 'latest': 700 }
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
    "http_reqs{endpoint:commits}": [`count>=${rpsThresholds['count']}`],
  },
  stages: stages,
  rps: rps,
  setupTimeout: '60s'
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = createGroup("group-api-v4-create-commit");
  let projectId = createProject(groupId);
  // Create a default branch
  createBranch(projectId, "main");

  let data = { groupId, projectId };
  return data;
}

export default function(data) {
  group("API - Create New Commit", function() {
    // Test creates a commit with 3 "update" actions and 1 "create" action for each VU.
    let createCommitRes = createCommit(data.projectId, __ITER === 0 ? "create" : "update");
    /20(0|1|4)/.test(createCommitRes.status) ? successRate.add(true) : successRate.add(false) && logError(createCommitRes);
  });
}

export function teardown(data) {
  deleteGroup(data.groupId, __ENV.ENVIRONMENT_URL);
}

export function createCommit(projectId, action) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, redirects: 0, tags: { endpoint: 'commits' } };
  let content = `# GitLab Performance Tool\nCommit ${action} action.\n\nThe GitLab Performance Tool (gpt) has been built by the GitLab Quality team to provide performance testing of any GitLab instance.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\n\nSed nec dui diam. Integer et ligula at urna accumsan iaculis sed a lectus.\n\nPraesent porttitor ex ipsum, sit amet tincidunt eros fringilla et.\n\nMorbi semper, massa ut ornare viverra, lectus turpis consectetur libero, ac feugiat ex erat non orci.\n\nProin eros metus, varius ut velit at, sagittis sodales mauris.\n\nPellentesque sit amet egestas neque.\n\nInteger eleifend eros vitae fringilla lacinia.\n\nInteger maximus condimentum arcu, id sodales nisi accumsan eu.\n\nMauris metus nunc, ultricies id imperdiet vel, ornare eget felis.\n\nProin odio lorem, auctor in accumsan vitae, tempor nec mi.\n\nProin venenatis elementum elit ac fringilla. Mauris eget porta enim.\n\nAliquam cursus quam et dui fringilla, blandit vulputate leo euismod.\n\nUt euismod augue auctor, rhoncus luctus.\n\n`
  // Content size: 30 lines, 1000 characters * 10 = roughly 10 kb
  content = content.repeat(10)
  let branch_name  = 'gpt-branch-'
  let body = {
    branch: `${branch_name}${__VU}`,
    commit_message: 'gpt-commit',
    actions: [
      {
        action: action,
        file_path: `gpt/gpt_${__VU}.md`,
        content: content
      },
      {
        action: action,
        file_path: `test/gpt_${__VU}.md`,
        content: content
      },
      {
        action: action,
        file_path: `gpt_${__VU}.md`,
        content: content
      }
    ]
  };
  // First commits will create new branches from 'main'
  if (action === "create") { body["start_branch"] = "main" } 
  if (action === "update") { body["actions"].push({ action: "create", file_path: `create/gpt_${__VU}_${__ITER}.md`, content: content }) }
  
  let createCommitRes = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}/repository/commits`, JSON.stringify(body), params);
  return createCommitRes;
}
