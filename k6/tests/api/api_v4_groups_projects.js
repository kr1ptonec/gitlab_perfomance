/*global __ENV : true  */
/*
@endpoint: `GET /groups/:id/projects`
@example_uri: /api/v4/groups/:environment_root_group/projects
@description: [Get a list of projects in this group](https://docs.gitlab.com/ee/api/groups.html#list-a-groups-projects)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/211498
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getManyGroupsOrProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { 'latest': 0.05 },
  'ttfb': { 'latest': 22000 },
};
export let customSuccessRate = 0.4 // https://gitlab.com/gitlab-org/gitlab/-/issues/211498#note_789522107 and https://gitlab.com/gitlab-org/quality/performance/-/issues/493
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${customSuccessRate}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let subgroups = getManyGroupsOrProjects(['encoded_subgroups_path']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${customSuccessRate*100}%`)
}

export default function() {
  group("API - Group Projects List", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let subgroup = selectRandom(subgroups);
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${subgroup}/projects`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
