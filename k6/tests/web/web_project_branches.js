/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/branches`
@description: Web - Project Branches Page. <br>Controllers: `BranchesController#index`, `Projects::BranchesController#diverging_commit_counts`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/322737
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let endpointCount = 2
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT, endpointCount)
export let ttfbThreshold = getTtfbThreshold(800)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:branches}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:branches/all}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:branches}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:branches/all}": [`count>=${rpsThresholds['count_per_endpoint']}`],
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
  let endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, 'branches')
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}

export default function(data) {
  group("Web - Project Branches Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}`, null, {tags: {endpoint: 'branches', controller: 'Projects::BranchesController', action: 'index'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/all`, null, {tags: {endpoint: 'branches/all', controller: 'Projects::BranchesController', action: 'index'}, redirects: 0}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
