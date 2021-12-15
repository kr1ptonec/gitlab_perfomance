/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/pipelines/:pipeline_id`
@description: Web - Project Pipeline Page. <br>Controllers: `Projects::PipelinesController#show`, `Projects::PipelinesController#show.json`, `Projects::Pipelines::TestsController#summary`, `Projects::PipelinesController#status`</br>
@gpt_data_version: 1
@gitlab_version: 13.7.0
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/320928
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash, getPipelineId, getPipelineIid } from "../../lib/gpt_data_helper_functions.js";
import { operationName, variables, pipelineDetailsQuery } from "../../lib/graphql/pipeline_details.js";

export const thresholds = {
  'ttfb': { 'latest': 6000 }
};
export const endpointCount = 5
export const webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT);
export const webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT);
export const rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT, endpointCount);
export const ttfbThreshold = getTtfbThreshold(thresholds['ttfb']);
export const successRate = new Rate("successful_requests");
export const options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{controller:Projects::PipelinesController#show}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::PipelinesController#show.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::PipelinesController#status}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::PipelinesController#jobs}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::Pipelines::TestsController}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{controller:Projects::PipelinesController#show}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::PipelinesController#show.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::PipelinesController#status}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::PipelinesController#jobs}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::Pipelines::TestsController}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'encoded_path', 'unencoded_path', 'pipeline_sha']);

export function setup() {
  console.log('');
  console.log(`Web Protocol RPS: ${webProtoRps}`);
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`);
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`);
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`);
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`);

  // Check if endpoint path has a dash \ redirect
  const checkProject = selectRandom(projects);
  const endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, 'pipelines');
  console.log(`Endpoint path is '${endpointPath}'`);
  
  // Get pipeline ID and IID from pipeline SHA
  projects.forEach(project => {
    project.pipelineId = getPipelineId(project['encoded_path'], project['pipeline_sha']);
    project.pipelineIid = getPipelineIid(project['unencoded_path'], project.pipelineId);
  });
  return { projects, endpointPath };
}

export default function(data) {
  group("Web - Project Pipelines Page", function() {
    const project = selectRandom(data.projects);

    const responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project.pipelineId}`, null, { tags: { controller: 'Projects::PipelinesController#show' }, redirects: 0 }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project.pipelineId}.json`, null, { tags: { controller: 'Projects::PipelinesController#show.json'}, redirects: 0 }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project.pipelineId}/status.json`, null, { tags: { controller: 'Projects::PipelinesController#status'}, redirects: 0 }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project.pipelineId}/tests/summary.json`, null, { tags: {controller: 'Projects::Pipelines::TestsController'}, redirects: 0 }],
    ]);
    
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
    
    const graphqlResponse = http.get(`${__ENV.ENVIRONMENT_URL}/api/graphql?query=${pipelineDetailsQuery}&operationName=${operationName}&variables=${variables(project['unencoded_path'], project.pipelineIid)}`, { tags: { controller: 'Projects::PipelinesController#jobs' } });
    const graphQLErrors = JSON.parse(graphqlResponse.body).errors
    graphQLErrors === undefined ? successRate.add(true) : (successRate.add(false), logError(graphQLErrors));
  });
}
