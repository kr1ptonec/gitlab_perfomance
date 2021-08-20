/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-upload-pack` <br> `POST /:group/:project.git/git-upload-pack` </br>
@description: Git Pull via HTTPS to pull from master having another branch locally. <br> Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_pull.md
@gpt_data_version: 1
*/

import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom, adjustRps, adjustStageVUs, checkProjectKeys } from "../../lib/gpt_k6_modules.js";
import { getRefsListGitPull, pullRefsData, checkCommitExists } from "../../lib/gpt_git_functions.js";

export let thresholds = {
  'ttfb': { 'latest': 400 },
};
export let gitProtoRps = adjustRps(__ENV.GIT_PULL_ENDPOINT_THROUGHPUT)
export let gitProtoStages = adjustStageVUs(__ENV.GIT_PULL_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.GIT_PULL_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: gitProtoRps,
  stages: gitProtoStages
};

export let projects = getLargeProjects(['encoded_path', 'unencoded_path', 'git_pull_data']);

projects.forEach(project => {
  project['git_pull_data'].forEach(git_pull_data => {
    let keysExist = checkProjectKeys(git_pull_data, ["want_commit_sha","have_commit_sha"]);
    if (!keysExist) fail(`Project ${project['name']} is missing required keys for test in ${JSON.stringify(git_pull_data)}. Exiting...`);
  });
});


export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)

  // Test should only run if specified commits exist in the project
  projects.forEach(project => {
    project['git_pull_data'].forEach(git_pull_data => {
      checkCommitExists(project, git_pull_data['have_commit_sha']);
      checkCommitExists(project, git_pull_data['want_commit_sha']);
    });
  });
  return projects;
}

export default function (projects) {
  let project = selectRandom(projects);
  let pullData = selectRandom(project['git_pull_data']);

  group("Git - Git Pull HTTP", function() {
    group("Git - Get Refs List", function () {
      let refsListResponse = getRefsListGitPull(project);
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : (successRate.add(false), logError(refsListResponse));
    });
  
    group("Git - Git Pull Refs", function () {
      let pullResponse = pullRefsData(project, pullData['want_commit_sha'], pullData['have_commit_sha']);
      /20(0|1)/.test(pullResponse.status) ? successRate.add(true) : (successRate.add(false), logError(pullResponse));
    });
  });
}
