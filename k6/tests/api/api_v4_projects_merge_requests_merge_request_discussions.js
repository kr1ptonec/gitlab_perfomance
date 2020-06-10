/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/merge_requests/:merge_request_iid/discussions`
@description: [Gets a list of all discussion items for a single merge request](https://docs.gitlab.com/ee/api/discussions.html#list-project-merge-request-discussion-items)
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/221071
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let rpsThresholds = getRpsThresholds(0.8)
export let ttfbThreshold = getTtfbThreshold(1500)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['name', 'group_path_api', 'mr_discussions_iid']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Merge Request Discussions", function() {
    let project = selectRandom(projects);
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group_path_api']}%2F${project['name']}/merge_requests/${project['mr_discussions_iid']}/discussions`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
