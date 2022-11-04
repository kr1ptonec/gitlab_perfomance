/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/pipelines`
@example_uri: /:unencoded_path/pipelines
@description: Web - Project Pipelines Page. <br>Controllers: `Projects::PipelinesController#index`, `Projects::PipelinesController#index.json`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/268237
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'rps': { '15.4.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.6, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.8 },
  'ttfb': { '15.4.0': 1000, 'latest': 600 }
};
export let endpointCount = 2
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
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

export let projects = getLargeProjects(['name', 'unencoded_path']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Check if endpoint path has a dash \ redirect
  let checkProject = selectRandom(projects)
  let endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, 'pipelines')
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}

export default function(data) {
  group("Web - Project Pipelines Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}`, null, {tags: {endpoint: '/pipelines', controller: 'Projects::PipelinesController', action: 'index'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}.json`, null, {tags: {endpoint: '/pipelines.json', controller: 'Projects::PipelinesController', action: 'index.json'}, redirects: 0}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
