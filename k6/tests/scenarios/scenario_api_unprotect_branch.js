/*global __ENV : true  */
/*
@endpoint: `DELETE /projects/:id/protected_branches/:branch` <br> `POST /projects/:id/protected_branches`
@description: [Unprotects the given protected branch or wildcard protected branch](hhttps://docs.gitlab.com/ee/api/protected_branches.html#unprotect-repository-branches)
@issue: https://gitlab.com/gitlab-org/gitlab/issues/39169
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { getRpsThresholds, getProjects, selectProject, adjustRps, adjustStageVUs } from "../../lib/k6_test_modules.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not been set. Skipping...')

// RPS and Success Rate are adjusted to mitigate issues with protect/unprotect request conflitcs
export let unprotectRps = adjustRps(0.05);
export let unprotectStages = adjustStageVUs(0.05);
export let rpsThresholds = getRpsThresholds(0.05);
export let successThreshold = __ENV.SUCCESS_RATE_THRESHOLD * 0.8;
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${successThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  stages: unprotectStages,
  rps: unprotectRps
};
export let projects = getProjects(['name', 'group', 'branch']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(successThreshold)*100}%`)

  projects.forEach(function(project) {
    let protectedBranch = isBranchProtected(project['group'], project['name'], project['branch']);
    if (protectedBranch) unprotectBranch(project['group'], project['name'], project['branch']);
  })
}

export default function() {
  group("API - Unprotect Protected Branch", function() {
    let project = selectProject(projects);
    let protectBranch = {
      method: "POST",
      url: `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/protected_branches`,
      body: { name: project['branch'] },
      params: { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } }	
    };
    let unprotectBranch = {
      method: "DELETE",
      url: `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/protected_branches/${project['branch']}`,
      body: undefined,
      params: { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } }	
    };
    let responses = http.batch( [protectBranch, unprotectBranch] );
    let unprotectBranchResponse = responses[1];
    /20(0|4)/.test(unprotectBranchResponse.status) ? successRate.add(true) : successRate.add(false);
  });
}

export function teardown() {
  projects.forEach(project => unprotectBranch(project['group'], project['name'], project['branch']));
}

function unprotectBranch(groupName,projectName, branch) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.del(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${groupName}%2F${projectName}/protected_branches/${branch}`, undefined, params);
  return res;
}

function isBranchProtected(groupName,projectName, branch) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${groupName}%2F${projectName}/protected_branches/${branch}`, params);
  return /20(0|1)/.test(res.status);
}
