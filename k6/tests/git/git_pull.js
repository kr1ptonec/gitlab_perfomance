/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-upload-pack` <br> `POST /:group/:project.git/git-upload-pack` </br>
@description: Git Pull via HTTPS to pull from master having another branch locally. <br> Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_pull.md
@gpt_data_version: 1
*/

import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { getRefsListGitPull, pullRefsData, getRefSHAs } from "../../lib/gpt_git_functions.js";

export let gitProtoRps = adjustRps(__ENV.GIT_PULL_ENDPOINT_THROUGHPUT)
export let gitProtoStages = adjustStageVUs(__ENV.GIT_PULL_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.GIT_PULL_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold()
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

export let projects = getLargeProjects(['encoded_path', 'group_path_web', 'mr_commits_iid']);

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)

  // Prepare SHA references of master and `branch` commits for git pull
  projects.forEach(project => { project.refSHAs = getRefSHAs(project); });
  return projects;
}

export default function (projects) {
  let project = selectRandom(projects);

  group("Git - Git Pull HTTP", function() {
    group("Git - Get Refs List", function () {
      let refsListResponse = getRefsListGitPull(project);
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : (successRate.add(false), logError(refsListResponse));
    });
  
    group("Git - Git Pull Refs", function () {
      let pullResponse = pullRefsData(project, project.refSHAs.headRefSHA, project.refSHAs.diffRefSHA);
      /20(0|1)/.test(pullResponse.status) ? successRate.add(true) : (successRate.add(false), logError(pullResponse));
    });
  });
}
