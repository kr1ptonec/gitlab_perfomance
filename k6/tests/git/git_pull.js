/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project.git/info/refs?service=git-upload-pack` <br> `POST /:group/:project.git/git-upload-pack` </br>
@description: Git pull from master having another branch locally 
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getProjects, selectProject, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";

export let gitProtoRps = adjustRps(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let gitProtoStages = adjustStageVUs(__ENV.GIT_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.GIT_ENDPOINT_THROUGHPUT)
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

export let projects = getProjects(['name', 'group', 'mr_commits_iid']);

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)
}

export default function () {
  let project = selectProject(projects);
  let projectRefSHAs = getRefSHAs(project);

  group("Gitaly - git pull", function() {
    group("API - Get Refs List", function () {
      let refsListResponse = getRefsList(project);
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : successRate.add(false) && logError(refsListResponse);
    });
  
    group("API - Pull Refs Data", function () {
      let pullResponse = pullRefsData(project, projectRefSHAs.headRefSHA, projectRefSHAs.diffRefSHA);
      /20(0|1)/.test(pullResponse.status) ? successRate.add(true) : successRate.add(false) && logError(pullResponse);
    });
  });
}

// https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols#_downloading_data
// Get remote references SHA-1s to pull them later
function getRefSHAs(project) {
  let largeBranchName = getLargeBranchName(project);
  let refsListResponse = getRefsList(project);
  let resBody = refsListResponse.body;
  let regexHeadRef = /001e# service=git-upload-pack\n[0-9a-f]{8}([0-9a-f]{40}) HEAD/;
  let headRefSHA = resBody.match(regexHeadRef)[1];
  let regexDiffHeadRef = new RegExp(`\n[0-9a-f]{4}([0-9a-f]{40}) refs/heads/${largeBranchName}\n`);
  let diffRefSHA = resBody.match(regexDiffHeadRef)[1];
  /20(0|1)/.test(refsListResponse.status) ? console.debug(`List of the remote references received`) : fail("Error receiving references list") && logError(refsListResponse);
  headRefSHA ? console.debug(`Master head reference: ${headRefSHA}`) : fail("Master head reference not found");
  diffRefSHA ? console.debug(`Another branch head reference: ${diffRefSHA}`) : fail("Another branch head reference not found");
  return { headRefSHA, diffRefSHA };
}

// The client initiates a `fetch-pack` process that connects to an `upload-pack` 
// process on the remote side to negotiate what data will be transferred down.
function getRefsList(project) {
  let params = {
    headers: {
      "Accept": "*/*",
      "Accept-Encoding": "deflate, gzip",
      "Pragma": "no-cache"
    }
  };
  let response = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}.git/info/refs?service=git-upload-pack`, params);
  return response;
}

// Post request to pull objects that `fetch-pack` process needs 
// by sending “want” and then the SHA-1 it wants = master head
// and sending "have" SHA-1 client already has = branch head with the biggest changes
function pullRefsData(project, firstRefSHA, secondRefSHA) {
  let params = {
    headers: {
      "Accept": "application/x-git-upload-pack-result",
      "Accept-Encoding": "deflate, gzip",
      "Content-Type": "application/x-git-upload-pack-request"
    }
  };
  let body = `0054want ${firstRefSHA} multi_ack side-band-64k ofs-delta\n00000032have ${secondRefSHA}\n00000009done\n`;
  let response = http.post(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}.git/git-upload-pack`, body, params);
  return response;
}

function getLargeBranchName(project) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/merge_requests/${project['mr_commits_iid']}`, params);
  let branchName = JSON.parse(res.body)['target_branch'];
  branchName ? console.debug(`Branch with a lot of commits: ${branchName}`) : fail("Branch not found");
  return branchName;
}
