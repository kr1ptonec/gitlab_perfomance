/*global __ENV : true  */
/*
@endpoint: `GET /groups/:id/projects`
@description: [Get a list of projects in this group](https://docs.gitlab.com/ee/api/groups.html#list-a-groups-projects)
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/211498
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getManyGroupsOrProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let rpsThresholds = getRpsThresholds(0.4)
export let ttfbThreshold = getTtfbThreshold(4000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let subgroups = getManyGroupsOrProjects(['subgroups']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Group Projects List", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let subgroup = selectRandom(subgroups);  
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${subgroup}/projects`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));    
  });
}
