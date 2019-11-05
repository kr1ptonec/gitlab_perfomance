/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/merge_requests/:merge_request_iid/diffs.json`
@description: Web - Merge Request Diffs Controller Show JSON
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getProjects, selectProject } from "../modules/custom_k6_modules.js";

export let rpsThresholds = getRpsThresholds()
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getProjects(['name', 'group', 'mr_commits_iid']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Merge Request Diffs Controller Show JSON", function() {
    let project = selectProject(projects);

    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/merge_requests/${project['mr_commits_iid']}/diffs.json`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
