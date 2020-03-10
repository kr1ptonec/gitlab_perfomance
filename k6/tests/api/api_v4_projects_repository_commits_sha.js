/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/repository/commits/:sha`
@description: [Get a specific commit identified by the commit hash](https://docs.gitlab.com/ee/api/commits.html#get-a-single-commit)
@flags: repo_storage
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, checkAccessToken, getRpsThresholds, getTtfbThreshold, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

checkAccessToken();

export let rpsThresholds = __ENV.ENVIRONMENT_REPO_STORAGE == "nfs" ? getRpsThresholds(0.5) : getRpsThresholds()
export let ttfbThreshold = __ENV.ENVIRONMENT_REPO_STORAGE == "nfs" ? getTtfbThreshold(3000) : getTtfbThreshold()
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getProjects(['name', 'group', 'commit_sha']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Project Repository Commit Overview", function() {
    let project = selectProject(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/repository/commits/${project['commit_sha']}`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
