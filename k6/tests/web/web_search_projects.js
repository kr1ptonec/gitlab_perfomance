/*global __ENV : true  */
/*
@endpoint: `GET /:search?project_id=:id`
@description: Web - Projects Search <br>Controllers: `SearchController#show`,`SearchController#count`</br>
@gitlab_settings: { "elasticsearch_indexing": true, "elasticsearch_search": true }
@flags: search
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/214830
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

let scopes = ['issues', 'commits', 'merge_requests', 'milestones', 'users']
let scopes_thresholds = {
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

export let projects = getProjects(['search']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint (Search): ${(parseFloat(rpsThresholds['mean_per_endpoint']) / scopes.length ).toFixed(2)}/s (${(parseFloat(rpsThresholds['count_per_endpoint']) / scopes.length ).toFixed(0)})`)
  console.log(`RPS Threshold per Endpoint (Count): ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  projects.forEach(project => {
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}`);
    project['id'] = JSON.parse(res.body)['id'];
  });
}

export default function() {
  group("Web - Project Search", function() {
    let project = selectProject(projects);

    scopes.forEach(scope => {
      let res = http.get(`${__ENV.ENVIRONMENT_URL}/search?scope=${scope}&project_id=${project['id']}&search=${project['search'][scope]}`, {tags: {endpoint: scope, controller: 'SearchController', action: 'show'}});
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));

      let counts_res = http.batch(scopes.map(count_scope => ["GET", `${__ENV.ENVIRONMENT_URL}/search/count?scope=${count_scope}&project_id=${project['id']}&search=${project['search'][scope]}`, null, { tags: { endpoint: `${count_scope}_count`, controller: 'SearchController', action: 'count' } }]));
      counts_res.forEach(res => {
        /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
      });
    })
  });
}