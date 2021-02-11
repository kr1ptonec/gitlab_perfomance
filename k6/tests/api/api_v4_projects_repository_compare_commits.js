/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/repository/compare?from=commit_sha1&to=commit_sha2`
@description: [Compare commits](https://docs.gitlab.com/ee/api/repositories.html#compare-branches-tags-or-commits)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/297497
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let rpsThresholds = getRpsThresholds(0.7)
export let ttfbThreshold = getTtfbThreshold(3000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['encoded_path', 'compare_commits_sha']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}
export default function() {
  group("API - Project Repository Compare Commits", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/repository/compare?from=${project['compare_commits_sha'][0]}&to=${project['compare_commits_sha'][1]}`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
