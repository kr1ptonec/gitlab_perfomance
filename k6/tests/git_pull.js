/*global __ENV : true  */

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, adjustRps, adjustStageVUs } from "./modules/custom_k6_modules.js";

export let gitProtoRps = adjustRps(__ENV.GIT_ENDPOINT_THRESHOLD);
export let gitProtoStages = adjustStageVUs(__ENV.GIT_ENDPOINT_THRESHOLD);
export let rpsThresholds = getRpsThresholds(__ENV.GIT_ENDPOINT_THRESHOLD);
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: gitProtoRps,
  stages: gitProtoStages
};

export function setup() {
  console.log('')
  console.log(`Git Protocol RPS: ${gitProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD) * 100}%`)

  let data = getRefSHAs();
  return data;
}

export default function (data) {
  group("Gitaly - git pull", function() {
    group("API - Get Refs List", function () {
      let refsListResponse = getRefsList();
      /20(0|1)/.test(refsListResponse.status) ? successRate.add(true) : successRate.add(false) && logError(refsListResponse);
    });
  
    group("API - Pull Refs Data", function () {
      let pullResponse = pullRefsData(data.headRefSHA, data.diffRefSHA);
      /20(0|1)/.test(pullResponse.status) ? successRate.add(true) : successRate.add(false) && logError(pullResponse);
    });
  });
}

// https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols#_downloading_data
// Get remote references SHA-1s to pull them later
function getRefSHAs() {
  let largeBranchName = getLargeBranchName();
  let refsListResponse = getRefsList();
  let resBody = refsListResponse.body;
  let regexHeadRef = /001e# service=git-upload-pack\n[0-9a-f]{8}([0-9a-f]{40}) HEAD/;
  let headRefSHA = resBody.match(regexHeadRef)[1];
  let regexDiffHeadRef = new RegExp(`\n[0-9a-f]{4}([0-9a-f]{40}) refs/heads/${largeBranchName}\n`);
  let diffRefSHA = resBody.match(regexDiffHeadRef)[1];
  /20(0|1)/.test(refsListResponse.status) ? console.log(`List of the remote references received`) : fail("Error receiving references list") && logError(refsListResponse);
  headRefSHA ? console.log(`Master head reference: ${headRefSHA}`) : fail("Master head reference not found");
  diffRefSHA ? console.log(`Another branch head reference: ${diffRefSHA}`) : fail("Another branch head reference not found");
  return { headRefSHA, diffRefSHA };
}

// The client initiates a `fetch-pack` process that connects to an `upload-pack` 
// process on the remote side to negotiate what data will be transferred down.
function getRefsList() {
  let params = {
    headers: {
      "Accept": "*/*",
      "Accept-Encoding": "deflate, gzip",
      "Pragma": "no-cache"
    }
  };
  let response = http.get(`${__ENV.ENVIRONMENT_URL}/${__ENV.PROJECT_GROUP}/${__ENV.PROJECT_NAME}.git/info/refs?service=git-upload-pack`, params);
  return response;
}

// Post request to pull objects that `fetch-pack` process needs 
// by sending “want” and then the SHA-1 it wants = master head
// and sending "have" SHA-1 client already has = branch head with the biggest changes
function pullRefsData(firstRefSHA, secondRefSHA) {
  let params = {
    headers: {
      "Accept": "application/x-git-upload-pack-result",
      "Accept-Encoding": "deflate, gzip",
      "Content-Type": "application/x-git-upload-pack-request"
    }
  };
  let body = `0054want ${firstRefSHA} multi_ack side-band-64k ofs-delta\n00000032have ${secondRefSHA}\n00000009done\n`;
  let response = http.post(`${__ENV.ENVIRONMENT_URL}/${__ENV.PROJECT_GROUP}/${__ENV.PROJECT_NAME}.git/git-upload-pack`, body, params);
  return response;
}

function getLargeBranchName() {
  let params = { headers: { "Accept": "application/json" } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${__ENV.PROJECT_GROUP}%2F${__ENV.PROJECT_NAME}/merge_requests/${__ENV.PROJECT_MR_COMMITS_IID}`, params);
  let branchName = JSON.parse(res.body)['target_branch'];
  branchName ? console.log(`Branch with a lot of commits: ${branchName}`) : fail("Branch not found");
  return branchName;
}
