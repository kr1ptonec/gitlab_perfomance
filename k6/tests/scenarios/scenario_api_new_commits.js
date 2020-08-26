/* global __ENV, __VU, __ITER */
/*
@endpoint: `POST /projects/:id/repository/commits`
@description: [Create a commit with multiple files and actions](https://docs.gitlab.com/ee/api/commits.html#create-a-commit-with-multiple-files-and-actions)
@flags: unsafe
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { createGroup, createProject, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let rps = adjustRps(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let stages = adjustStageVUs(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold(700)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  stages: stages,
  rps: rps,
  setupTimeout: '60s'
};

// Setup creates 'commits_count' files for commit request tests.
// For higher RPS we need to increase commits count to resolve concurrency issues
export let commits_count = options.rps > 4 ? 20 : 10;

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  let groupId = createGroup("group-api-v4-create-commit");
  let projectId = createProject(groupId);

  console.log('Creating files for commits')
  for (let i = 1; i <= commits_count; i++) {
    let createCommitRes = createCommit(projectId, "create", i);
    if (!/20(0|1)/.test(createCommitRes.status)) logError(createCommitRes);
  }

  let data = { groupId, projectId };
  return data;
}

export default function(data) {
  group("API - Create New Commit", function() {
    let random_file_path_postfix = Math.floor(Math.random() * commits_count) + 1;
    // Test creates a commit with 3 "update" actions and 1 "create" action.
    let createCommitRes = createCommit(data.projectId, "update", random_file_path_postfix, true);
    /20(0|1|4)/.test(createCommitRes.status) ? successRate.add(true) : successRate.add(false) && logError(createCommitRes);
  });
}
export function teardown(data) {
  deleteGroup(data.groupId, __ENV.ENVIRONMENT_URL);
}

export function createCommit(projectId, action, file_postfix, update = false) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}`, 'Content-Type': 'application/json' } };
  let content = `# GitLab Performance Tool\nCommit ${action} action.\n\nThe GitLab Performance Tool (gpt) has been built by the GitLab Quality team to provide performance testing of any GitLab instance.\n\nLorem ipsum dolor sit amet, consectetur adipiscing elit.\n\nSed nec dui diam. Integer et ligula at urna accumsan iaculis sed a lectus.\n\nPraesent porttitor ex ipsum, sit amet tincidunt eros fringilla et.\n\nMorbi semper, massa ut ornare viverra, lectus turpis consectetur libero, ac feugiat ex erat non orci.\n\nProin eros metus, varius ut velit at, sagittis sodales mauris.\n\nPellentesque sit amet egestas neque.\n\nInteger eleifend eros vitae fringilla lacinia.\n\nInteger maximus condimentum arcu, id sodales nisi accumsan eu.\n\nMauris metus nunc, ultricies id imperdiet vel, ornare eget felis.\n\nProin odio lorem, auctor in accumsan vitae, tempor nec mi.\n\nProin venenatis elementum elit ac fringilla. Mauris eget porta enim.\n\nAliquam cursus quam et dui fringilla, blandit vulputate leo euismod.\n\nUt euismod augue auctor, rhoncus luctus.\n\n`
  // Content size: 30 lines, 1000 characters * 10 = roughly 10 kb
  content = content.repeat(10)
  let branch_name  = 'gpt-branch-'
  let body = {
    branch: `${branch_name}${file_postfix}`,
    commit_message: 'gpt-commit',
    actions: [
      {
        action: action,
        file_path: `gpt/gpt_${file_postfix}.md`,
        content: content
      },
      {
        action: action,
        file_path: `test/gpt_${file_postfix}.md`,
        content: content
      },
      {
        action: action,
        file_path: `gpt_${file_postfix}.md`,
        content: content
      }
    ]
  };
  if (update) { body["actions"].push({ action: "create", file_path: `create/gpt_${__VU}_${__ITER}.md`, content: content }) }
  // Create rest of the branches from the first created branch
  if (!update && file_postfix != 1) { body["start_branch"] = `${branch_name}1` } 
  let createCommitRes = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}/repository/commits`, JSON.stringify(body), params);
  return createCommitRes;
}
