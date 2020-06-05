/*global __ENV : true  */
/*
@endpoint: `GET /groups/:id/search?scope=*`
@description: [Group Search API](https://docs.gitlab.com/ee/api/search.html#group-search-api)
@gitlab_settings: { "elasticsearch_indexing": true, "elasticsearch_search": true }
@flags: search
@issue: https://gitlab.com/groups/gitlab-org/-/epics/3166
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 6
export let rpsThresholds = getRpsThresholds(0.3, endpointCount)
export let ttfbThreshold = getTtfbThreshold(25000)
export let successRate = new Rate("successful_requests")

let scopes = ['projects', 'issues', 'commits', 'merge_requests', 'milestones', 'users']
let scopes_thresholds = {
  "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD * 0.1}`],
  "http_reqs": [`count>=${rpsThresholds['count']}`],
}
scopes.forEach(scope => {
  scopes_thresholds[`http_req_waiting{endpoint:${scope}}`] = [`p(90)<${ttfbThreshold}`],
  scopes_thresholds[`http_reqs{endpoint:${scope}}`] = [`count>=${rpsThresholds['count_per_endpoint']}`]
})
export let options = {
  thresholds: scopes_thresholds
};

export let projects = getLargeProjects(['search']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD * 0.1)*100}%`)
}

export default function() {
  group("API - Group Search", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['group_path_api']}/search?scope=projects&search=${project['search']['projects']}`, null, Object.assign({}, params, { tags: { endpoint: 'projects' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['group_path_api']}/search?scope=issues&search=${project['search']['issues']}`, null, Object.assign({}, params, { tags: { endpoint: 'issues' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['group_path_api']}/search?scope=commits&search=${project['search']['commits']}`, null, Object.assign({}, params, { tags: { endpoint: 'commits' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['group_path_api']}/search?scope=merge_requests&search=${project['search']['merge_requests']}`, null, Object.assign({}, params, { tags: { endpoint: 'merge_requests' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['group_path_api']}/search?scope=milestones&search=${project['search']['milestones']}`, null, Object.assign({}, params, { tags: { endpoint: 'milestones' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['group_path_api']}/search?scope=users&search=${project['search']['users']}`, null, Object.assign({}, params, { tags: { endpoint: 'users' } })],

      // Blobs are disabled due to bad performance causing errors and knock on effects
      // ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['group_path_api']}/search?scope=blobs&search=${project['search']['blobs']}`, null, Object.assign({}, params, { tags: { endpoint: 'blobs' } })],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
