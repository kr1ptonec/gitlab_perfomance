/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-receive-pack` <br> `POST /:group/:project.git/git-receive-pack` </br>
@description: Git push commit(s) via HTTPS. <br> Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/334437
@flags: unsafe
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { getRefsListGitPush, pushRefsData, checkCommitExists, prepareGitPushData, updateProjectPipelinesSetting, checkAdminAccess, waitForGitSidekiqQueue } from "../../lib/gpt_git_functions.js";

export let thresholds = {
  'ttfb': { 'latest': 1000 },
};
export let endpointCount = 3
export let gitProtoRps = adjustRps(__ENV.GIT_PUSH_ENDPOINT_THROUGHPUT)
export let gitProtoStages = adjustStageVUs(__ENV.GIT_PUSH_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.GIT_PUSH_ENDPOINT_THROUGHPUT, endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:get-refs-git-receive-pack}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:post-git-receive-pack}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:get-refs-git-receive-pack}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:post-git-receive-pack}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: gitProtoRps,
  stages: gitProtoStages,
  teardownTimeout: '600s'
};

export let authEnvUrl = __ENV.ENVIRONMENT_URL.replace(/(^https?:\/\/)(.*)/, `$1test:${__ENV.ACCESS_TOKEN}@$2`)
export let projects = getLargeProjects(['encoded_path', 'git_push_data']);

projects = prepareGitPushData(projects)

export function setup() {
  checkAdminAccess();

  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)

  // Test should only run if specified commits exist in the project
  // Also disable Pipelines for the project during the test to prevent them being triggered en masse.
  projects.forEach(project => {
    project['git_push_data'].forEach(git_push_data => {
      checkCommitExists(project, git_push_data['branch_current_head_sha']);
      checkCommitExists(project, git_push_data['branch_new_head_sha']);
    });
    updateProjectPipelinesSetting(project, false);
  });
}

export default function () {
  let project = selectRandom(projects);

  group("Git - Git Push HTTPS", function () {
    group("Git - Get Refs List", function () {
      let refsListResponse = getRefsListGitPush(authEnvUrl, project);
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : (successRate.add(false), logError(refsListResponse));
    });

    if (project.data) {
      group("Git - Git Push Data", function () {
        let pushData = selectRandom(project.data);
        let pushResponses = pushRefsData(authEnvUrl, project, pushData);
        pushResponses.forEach(function (res) {
          /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res)) ;
        });
      });
    }
    else {
      successRate.add(false)
    }
  });
}

export function teardown() {
  waitForGitSidekiqQueue();
  projects.forEach(project => {
    // Ensure that all branches were restored to the original `branch_current_head_sha` 
    let params = {
      headers: {
        "Accept": "application/x-git-receive-pack-result",
        "Content-Type": "application/x-git-receive-pack-request"
      }
    };
    http.post(`${authEnvUrl}/${project['unencoded_path']}.git/git-receive-pack`, project.data.branch_set_old_head, params);
    // Reenable Pipelines in the Project
    updateProjectPipelinesSetting(project, true);
  });
}
