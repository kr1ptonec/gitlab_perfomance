/*global __ENV : true  */
/*
@endpoint: `GET /:search?project_id=:id`
@description: Web - Projects Search <br>Controllers: `SearchController#show`,`SearchController#count`</br>
@gpt_data_version: 1
@gitlab_settings: { "elasticsearch_indexing": true, "elasticsearch_search": true }
@flags: search
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/254966
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { getRandomSearchTerm } from "../../lib/gpt_random_search_term.js"

export let scopes = ['issues', 'commits', 'merge_requests', 'milestones', 'users', 'blobs', 'notes']

export let thresholds = {
  'ttfb': { 'latest': 3000 }
};
export let endpointCount = scopes.length * 2
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT, endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")

export let scopes_thresholds = {
  "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
  "http_reqs": [`count>=${rpsThresholds['count']}`],
}
scopes.forEach(scope => {
  scopes_thresholds[`http_req_waiting{endpoint:${scope}}`] = [`p(90)<${ttfbThreshold}`],
  scopes_thresholds[`http_req_waiting{endpoint:${scope}_count}`] = [`p(90)<${ttfbThreshold}`]
  scopes_thresholds[`http_reqs{endpoint:${scope}}`] = [`count>=${(parseFloat(rpsThresholds['count_per_endpoint']) / scopes.length ).toFixed(0)}`]
  scopes_thresholds[`http_reqs{endpoint:${scope}_count}`] = [`count>=${rpsThresholds['count_per_endpoint']}`]
})
export let options = {
  thresholds: scopes_thresholds,
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['encoded_path', 'search']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint (Search): ${(parseFloat(rpsThresholds['mean_per_endpoint']) / scopes.length ).toFixed(2)}/s (${(parseFloat(rpsThresholds['count_per_endpoint']) / scopes.length ).toFixed(0)})`)
  console.log(`RPS Threshold per Endpoint (Count): ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  projects.forEach(project => {
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${project['encoded_group_path']}`);
    project['group_id'] = JSON.parse(res.body)['group_id'];
    res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}`);
    project['id'] = JSON.parse(res.body)['id'];
  });
}

export default function() {
  group("Web - Project Search", function() {
    let project = selectRandom(projects);

    scopes.forEach(scope => {
      let searchTerm = (scope == 'milestones') ? getRandomSearchTerm(project['search']['milestones'],1) : (scope == 'users') ? getRandomSearchTerm(project['search']['users'],1) : getRandomSearchTerm(project['search'][scope],3);

      let res = http.get(`${__ENV.ENVIRONMENT_URL}/search?scope=${scope}&group_id=${project['group_id']}&project_id=${project['id']}&search=${searchTerm}`, {tags: {endpoint: scope, controller: 'SearchController', action: 'show'}, redirects: 0});
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));

      let counts_res = http.batch(scopes.map(count_scope => ["GET", `${__ENV.ENVIRONMENT_URL}/search/count?scope=${count_scope}&project_id=${project['id']}&search=${searchTerm}`, null, { tags: { endpoint: `${count_scope}_count`, controller: 'SearchController', action: 'count' }, redirects: 0 }]));
      counts_res.forEach(res => {
        /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
      });
    })
  });
}
