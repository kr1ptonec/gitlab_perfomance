/*global __ENV : true  */
/*
@endpoint: `GET /search?scope=*`
@description: [Global Search](https://docs.gitlab.com/ee/api/search.html#global-search-api)
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 5
export let rpsThresholds = getRpsThresholds(0.3, endpointCount)
export let ttfbThreshold = getTtfbThreshold(17500)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:projects}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:issues}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:merge_requests}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:milestones}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:users}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:projects}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:issues}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:merge_requests}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:milestones}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:users}": [`count>=${rpsThresholds['count_per_endpoint']}`],
  }
};

export let projects = getProjects(['search_global']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Global Search", function() {
    let project = selectProject(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/search?scope=projects&search=${project['search_global']['projects']}`, null, Object.assign({}, params, { tags: { endpoint: 'projects' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/search?scope=issues&search=${project['search_global']['issues']}`, null, Object.assign({}, params, { tags: { endpoint: 'issues' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/search?scope=merge_requests&search=${project['search_global']['merge_requests']}`, null, Object.assign({}, params, { tags: { endpoint: 'merge_requests' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/search?scope=milestones&search=${project['search_global']['milestones']}`, null, Object.assign({}, params, { tags: { endpoint: 'milestones' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/search?scope=users&search=${project['search_global']['users']}`, null, Object.assign({}, params, { tags: { endpoint: 'users' } })],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
