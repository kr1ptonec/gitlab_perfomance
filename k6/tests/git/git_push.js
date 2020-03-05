/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-receive-pack` <br> `POST /:group/:project.git/git-receive-pack` </br>
@description: Git push commit(s) via HTTPS. <br> Documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md`
*/

import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, checkProjectKeys, adjustRps, adjustStageVUs, getGitPushData } from "../../lib/gpt_k6_modules.js";
import { getRefsListGitPush, pushRefsData, checkCommitExists, prepareGitPushData, waitForProjectImport, getProjectPathWithNamespace, prepareExportFile } from "../../lib/gpt_git_functions.js";
import { createGroup, importProject, deleteGroup } from "../../lib/gpt_scenario_functions.js";

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
  setupTimeout: '600s',
  teardownTimeout: '60s'
};

export let authEnvUrl = __ENV.ENVIRONMENT_URL.replace(/(^https?:\/\/)(.*)/, `$1test:${__ENV.ACCESS_TOKEN}@$2`);
export let gitPushData = getGitPushData();
gitPushData = prepareGitPushData(gitPushData);

export let exportFile = prepareExportFile(gitPushData.export_file_path);
if (!exportFile) fail('Project export file not found. Skipping...');

if (!checkProjectKeys(gitPushData, ["branch_current_head_sha","branch_new_head_sha","branch_name"])) fail('No projects found with required keys for test. Exiting...');

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)

  // Create a group and import new project. `http.post` is used - this comment flags the test as unsafe.
  let groupId = createGroup("group-api-v4-git-push");
  let projectId = importProject(groupId, exportFile);
  waitForProjectImport(projectId);
  let projectPathWithNamespace = getProjectPathWithNamespace(projectId);
  let projectData = { groupId, projectId, projectPathWithNamespace };

  checkCommitExists(projectId, gitPushData['branch_current_head_sha']);
  checkCommitExists(projectId, gitPushData['branch_new_head_sha']);

  return projectData;
}

export default function (projectData) {
  group("Git - Git Push HTTPS", function () {
    group("Git - Get Refs List", function () {
      let refsListResponse = getRefsListGitPush(authEnvUrl, projectData.projectPathWithNamespace);
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : (successRate.add(false), logError(refsListResponse));
    });
    
    if (gitPushData.data) {
      group("Git - Git Push Data", function () {
        let pushResponses = pushRefsData(authEnvUrl, projectData.projectPathWithNamespace, gitPushData);
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

export function teardown(projectData) {
  deleteGroup(projectData.groupId);
}
