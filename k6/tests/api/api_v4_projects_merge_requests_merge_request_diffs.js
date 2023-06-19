/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/merge_requests/:merge_request_iid/diffs`
@example_uri: /api/v4/projects/:encoded_path/merge_requests/:mr_changes_iid/diffs
@description: [List merge request diffs](https://docs.gitlab.com/ee/api/merge_requests.html#list-merge-request-diffs) for GitLab 15.7 and later. <br> [Get single MR changes](https://docs.gitlab.com/ee/api/merge_requests.html#get-single-merge-request-changes) before GitLab 15.7. </br>
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/225322, https://gitlab.com/gitlab-org/gitlab/-/issues/322117
@gpt_data_version: 1
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, envVersionIsHigherThan, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

let diff_endpoint = envVersionIsHigherThan('15.7.0') ? 'diffs' : 'changes';

export let thresholds = {
  'rps': { '13.6.0': 0.1, '15.7.0': 0.4 },
  'ttfb': { '13.6.0': 12000, '15.7.0': 3900 },
};
export let rpsThresholds = getRpsThresholds(thresholds['rps']);
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb']);
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['encoded_path', 'mr_changes_iid']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
  console.log(`Merge request diffs endpoint: ${diff_endpoint}`)
}

export default function() {
  group("API - Merge Request Diffs", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, responseType: 'none' };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/merge_requests/${project['mr_changes_iid']}/${diff_endpoint}`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}