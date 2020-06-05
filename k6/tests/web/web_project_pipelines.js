/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/pipelines`
@description: Web - Project Pipelines Page. <br>Controllers: `Projects::PipelinesController#index`, `Projects::PipelinesController#index.json`</br>
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 2
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT * 0.6, endpointCount)
export let ttfbThreshold = getTtfbThreshold(1000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:/pipelines}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:/pipelines.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:/pipelines}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:/pipelines.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'group_path_web']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Project Pipelines Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/pipelines`, null, {tags: {endpoint: '/pipelines', controller: 'Projects::PipelinesController', action: 'index'}}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/pipelines.json`, null, {tags: {endpoint: '/pipelines.json', controller: 'Projects::PipelinesController', action: 'index.json'}}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
