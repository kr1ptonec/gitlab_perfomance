/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/search?scope=*`
@description: [Project Search API](https://docs.gitlab.com/ee/api/search.html#project-search-api)
@gpt_data_version: 1
@gitlab_settings: { "elasticsearch_indexing": true, "elasticsearch_search": true }
@flags: search
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/229627
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { getRandomSearchTerm } from "../../lib/gpt_random_search_term.js"

export let thresholds = {
  'rps': { 'latest': 0.4 },
  'ttfb': { 'latest': 13000 },
};
export let endpointCount = 6
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")

let scopes = ['issues', 'commits', 'merge_requests', 'milestones', 'users', 'blobs']
let scopes_thresholds = {
  "successful_requests": [`rate>0.8`],
  "http_reqs": [`count>=${rpsThresholds['count']}`],
}
scopes.forEach(scope => {
  scopes_thresholds[`http_req_waiting{endpoint:${scope}}`] = [`p(90)<${ttfbThreshold}`],
  scopes_thresholds[`http_reqs{endpoint:${scope}}`] = [`count>=${rpsThresholds['count_per_endpoint']}`]
})
export let options = {
  thresholds: scopes_thresholds
};

export let projects = getLargeProjects(['encoded_path', 'search']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: 80%`)
}

export default function() {
  group("API - Project Search", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/search?scope=issues&search=${getRandomSearchTerm(project['search']['issues'],3)}`, null, Object.assign({}, params, { tags: { endpoint: 'issues' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/search?scope=commits&search=${getRandomSearchTerm(project['search']['commits'],3)}`, null, Object.assign({}, params, { tags: { endpoint: 'commits' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/search?scope=merge_requests&search=${getRandomSearchTerm(project['search']['merge_requests'],3)}`, null, Object.assign({}, params, { tags: { endpoint: 'merge_requests' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/search?scope=milestones&search=${getRandomSearchTerm(project['search']['milestones'],1)}`, null, Object.assign({}, params, { tags: { endpoint: 'milestones' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/search?scope=users&search=${getRandomSearchTerm(project['search']['users'],1)}`, null, Object.assign({}, params, { tags: { endpoint: 'users' } })],
      ["GET", `${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/search?scope=blobs&search=${getRandomSearchTerm(project['search']['blobs'],3)}`, null, Object.assign({}, params, { tags: { endpoint: 'blobs' } })],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
