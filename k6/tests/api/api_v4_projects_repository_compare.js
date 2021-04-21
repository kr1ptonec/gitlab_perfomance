/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/repository/compare?from=branch1&to=branch2`
@description: [Compare branches](https://docs.gitlab.com/ee/api/repositories.html#compare-branches-tags-or-commits)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/327763
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { 'latest': 0.3 },
  'ttfb': { 'latest': 5000 },
};
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['encoded_path', 'compare_branches']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Project Repository Compare Branches", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/repository/compare?from=${project['compare_branches'][0]}&to=${project['compare_branches'][1]}`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
