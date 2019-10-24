/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/merge_requests`
@description: [Get all merge requests for this project](https://docs.gitlab.com/ee/api/merge_requests.html#list-project-merge-requests)
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getProjects, selectProject } from "../modules/custom_k6_modules.js";

// Endpoint is below target threshold. Custom lower limit applied until fixed.
// Issue: https://gitlab.com/gitlab-org/gitlab/issues/33150
export let rpsThresholds = getRpsThresholds(0.25)
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getProjects();

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Merge Requests List", function() {
    let project = selectProject(projects);

    let params = { headers: { "Accept": "application/json" } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/merge_requests`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
