/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/merge_requests/:merge_request_iid/discussions`
@description: [Gets a list of all discussion items for a single merge request](https://docs.gitlab.com/ee/api/discussions.html#list-project-merge-request-discussion-items)
@issue: https://gitlab.com/gitlab-org/gitlab/issues/32455
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getProjects, selectProject } from "../../lib/k6_test_modules.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not be set. Exiting...')

// Endpoint is below target threshold. Custom lower limit applied until fixed.
export let rpsThresholds = getRpsThresholds(0.5)
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getProjects(['name', 'group', 'mr_discussions_iid']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Merge Request Discussions", function() {
    let project = selectProject(projects);
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/merge_requests/${project['mr_discussions_iid']}/discussions`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
