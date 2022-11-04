/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-upload-pack` <br> `POST /:group/:project.git/git-upload-pack` </br>
@description: Git Clone via HTTPS to clone from the specified branch. <br> Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_pull.md
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/334437
*/

import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { getRefsListGitPull, pullRefsData, checkCommitExists } from "../../lib/gpt_git_functions.js";

export let thresholds = {
  // RPS threshold is lowered due to the large downloads
  'rps': { 'latest': __ENV.GIT_CLONE_ENDPOINT_THROUGHPUT * 0.04 },
  'ttfb': { 'latest': 800 },
};
export let gitProtoRps = adjustRps(__ENV.GIT_CLONE_ENDPOINT_THROUGHPUT)
export let gitProtoStages = adjustStageVUs(__ENV.GIT_CLONE_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: gitProtoRps,
  stages: gitProtoStages,
  discardResponseBodies: true // Configure k6 not to load response body with repository to memory
};

export let projects = getLargeProjects(['encoded_path', 'unencoded_path', 'git_clone_data']);

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)

  // Test should only run if specified commits exist in the project
  projects.forEach(project => {
    project['git_clone_data'].forEach(git_clone_data => {
      checkCommitExists(project, git_clone_data);
    });
  });
  return projects;
}

export default function (projects) {
  let project = selectRandom(projects);
  let wantCommitSHA = selectRandom(project['git_clone_data']);

  group("Git - Git Clone HTTP", function() {
    group("Git - Get Refs List", function () {
      let refsListResponse = getRefsListGitPull(project);
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : (successRate.add(false), logError(refsListResponse));
    });
  
    group("Git - Git Clone Refs", function () {
      let pullResponse = pullRefsData(project, wantCommitSHA);
      /20(0|1)/.test(pullResponse.status) ? successRate.add(true) : (successRate.add(false), logError(pullResponse));
    });
  });
}
