/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/merge_requests/:merge_request_iid`
@example_uri: /api/v4/projects/:encoded_path/merge_requests/:mr_changes_iid
@description: [Get information about a single merge request](https://docs.gitlab.com/ee/api/merge_requests.html#get-single-mr)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/331490
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { 'latest': 0.5 },
  'ttfb': { 'latest': 3500 },
};
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  scenarios: {
    closed_model: {
      executor: 'constant-vus',
      vus: __ENV.GPT_RPS,
      duration: __ENV.GPT_TEST_DURATION,
    },
  },
};

export let projects = getLargeProjects(['encoded_path', 'mr_discussions_iid']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Merge Request update labels", function() {
    let project = selectRandom(projects);
    let labels = selectRandom(['API', 'Graph', 'Service', 'UI', 'arm', 'LDAP', 'Hooks', 'Email', 'Documentation', 'duplicate'])
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let formData = {
      labels: labels
    };
    let res = http.put(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/merge_requests/${project['mr_discussions_iid']}`, formData, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
