/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/merge_requests`
@example_uri: /api/v4/projects/:encoded_path/merge_requests
@description: [Get all merge requests for this project](https://docs.gitlab.com/ee/api/merge_requests.html#list-project-merge-requests)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/332392
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/33150, https://gitlab.com/gitlab-org/gitlab/-/issues/209780, https://gitlab.com/gitlab-org/gitlab/-/issues/250356
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { '13.1.0': 0.2, '13.4.0': 0.4, '14.0.0': 0.6 },
  'ttfb': { '13.1.0': 5000, '13.4.0': 2000, '14.0.0': 1000 },
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

export let projects = getLargeProjects(['encoded_path']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Merge Requests List", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/merge_requests`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
