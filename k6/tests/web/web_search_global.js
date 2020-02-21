/*global __ENV : true  */
/*
@endpoint: `GET /:search`
@description: Web - Global Search <br>Controllers: `SearchController#show`,`SearchController#count`</br>
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 10
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT, endpointCount)
export let ttfbThreshold = getTtfbThreshold(1000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:projects}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:projects_count}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:issues}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:issues_count}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:merge_requests}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:merge_requests_count}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:milestones}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:milestones_count}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:users}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:users_count}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:projects}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:projects_count}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:issues}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:issues_count}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:merge_requests}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:merge_requests_count}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:milestones}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:milestones_count}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:users}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:users_count}": [`count>=${rpsThresholds['count_per_endpoint']}`],
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getProjects(['search_global']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Global Search", function() {
    let project = selectProject(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/search?scope=projects&search=${project['search_global']['projects']}`, null, { tags: { endpoint: 'projects', controller: 'SearchController', action: 'show' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search/count?scope=projects&search=${project['search_global']['projects']}`, null, { tags: { endpoint: 'projects_count', controller: 'SearchController', action: 'count' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search?scope=issues&search=${project['search_global']['issues']}`, null, { tags: { endpoint: 'issues', controller: 'SearchController', action: 'show' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search/count?scope=issues&search=${project['search_global']['issues']}`, null, { tags: { endpoint: 'issues_count', controller: 'SearchController', action: 'count' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search?scope=merge_requests&search=${project['search_global']['merge_requests']}`, null, { tags: { endpoint: 'merge_requests', controller: 'SearchController', action: 'show' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search/count?scope=merge_requests&search=${project['search_global']['merge_requests']}`, null, { tags: { endpoint: 'merge_requests_count', controller: 'SearchController', action: 'count' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search?scope=milestones&search=${project['search_global']['milestones']}`, null, { tags: { endpoint: 'milestones', controller: 'SearchController', action: 'show' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search/count?scope=milestones&search=${project['search_global']['milestones']}`, null, { tags: { endpoint: 'milestones_count', controller: 'SearchController', action: 'count' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search?scope=users&search=${project['search_global']['users']}`, null, { tags: { endpoint: 'users', controller: 'SearchController', action: 'show' } }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/search/count?scope=users&search=${project['search_global']['users']}`, null, { tags: { endpoint: 'users_count', controller: 'SearchController', action: 'count' } }],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
