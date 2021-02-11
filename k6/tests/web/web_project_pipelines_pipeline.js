/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/pipelines/:pipeline_id`
@description: Web - Project Pipeline Page. <br>Controllers: `Projects::PipelinesController#show`, `Projects::PipelinesController#show.json`, `Projects::Pipelines::TestsController#summary`, `Projects::PipelinesController#status`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/320928
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { getPipelineId } from "../../lib/gpt_data_helper_functions.js";

export let endpointCount = 4
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT, endpointCount)
export let ttfbThreshold = getTtfbThreshold(2500)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:/pipeline}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:/pipeline.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:/pipeline/status.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:/pipeline/tests/summary.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:/pipeline}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:/pipeline.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:/pipeline/status.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:/pipeline/tests/summary.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'encoded_path', 'group_path_web', 'pipeline_sha']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Get pipeline ID from pipeline SHA
  projects.forEach(project => { project.pipelineId = getPipelineId(project['encoded_path'], project['pipeline_sha']); });
  return projects;
}

export default function(projects) {
  group("Web - Project Pipelines Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/pipelines/${project.pipelineId}`, null, {tags: {endpoint: '/pipeline', controller: 'Projects::PipelinesController', action: 'show'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/pipelines/${project.pipelineId}.json`, null, {tags: {endpoint: '/pipeline.json', controller: 'Projects::PipelinesController', action: 'show.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/pipelines/${project.pipelineId}/status.json`, null, {tags: {endpoint: '/pipeline/status.json', controller: 'Projects::PipelinesController', action: 'status'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/pipelines/${project.pipelineId}/tests/summary.json`, null, {tags: {endpoint: '/pipeline/tests/summary.json', controller: 'Projects::Pipelines::TestsController', action: 'tests/summary.json'}, redirects: 0}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
