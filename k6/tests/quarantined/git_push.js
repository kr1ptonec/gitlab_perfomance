/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-receive-pack` <br> `POST /:group/:project.git/git-receive-pack` </br>
@description: Git push commit(s) via HTTPS. <br> Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md`
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getProjects, selectProject, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { getRefsListGitPush, pushRefsData, checkCommitExists, prepareGitPushData, updateProjectPipelinesSetting } from "../../lib/gpt_git_functions.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not been set. Skipping...')

export let gitProtoRps = adjustRps(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let gitProtoStages = adjustStageVUs(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold(5000)
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: gitProtoRps,
  stages: gitProtoStages,
  teardownTimeout: '30s'
};

export let authEnvUrl = __ENV.ENVIRONMENT_URL.replace(/(^https?:\/\/)(.*)/, `$1test:${__ENV.ACCESS_TOKEN}@$2`)
export let projects = getProjects(['name', 'group', 'git_push_data']);
projects = prepareGitPushData(projects)

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)

  // Test should only run if specified commits exist in the project
  // and if Project Pipelines are disabled. Otherwise git push will trigger pipelines en masse.
  projects.forEach(project => {
    checkCommitExists(project, project['git_push_data']['branch_current_head_sha']);
    checkCommitExists(project, project['git_push_data']['branch_new_head_sha']);
    updateProjectPipelinesSetting(project, "disabled");
  });
}

export default function () {
  let project = selectProject(projects);

  group("Git - Git Push HTTPS", function () {
    group("Git - Get Refs List", function () {
      let refsListResponse = getRefsListGitPush(authEnvUrl, project);
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : (successRate.add(false), logError(refsListResponse));
    });
    
    if (project.data) {
      group("Git - Git Push Data", function () {
        let pushResponses = pushRefsData(authEnvUrl, project);
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
  projects.forEach(project => {
    // Ensure that all branches were restored to the original `branch_current_head_sha` 
    let params = {
      headers: {
        "Accept": "application/x-git-receive-pack-result",
        "Content-Type": "application/x-git-receive-pack-request"
      }
    };
    http.post(`${authEnvUrl}/${project['group']}/${project['name']}.git/git-receive-pack`, project.data.branch_set_old_head, params);
    // Enable Pipelines in the Project af the test
    updateProjectPipelinesSetting(project, "enabled");
  });
}
