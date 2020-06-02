/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/search?scope=blobs&search=:query`
@description: [Search throught the code within the specified project](https://docs.gitlab.com/ee/api/search.html#scope-blobs)
@flags: search
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/214830
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let rpsThresholds = getRpsThresholds(0.1)
export let ttfbThreshold = getTtfbThreshold(15000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['name', 'group']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Search Code within the Project", function() {
    let project = selectRandom(projects);

    let params = { 
      headers: { 
        "Accept": "application/json", 
        "Cache-Control": "no-cache", 
        "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` 
      } 
    };
    let searchQuery = "test"; 
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/search?scope=blobs&search=${searchQuery}`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
