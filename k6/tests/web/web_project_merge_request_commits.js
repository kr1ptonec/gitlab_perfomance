/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/merge_requests/:merge_request_iid/commits`
@description: Web - Project Merge Request Commits Page. <br>Controllers: `Projects::MergeRequestsController#show`, `Projects::MergeRequestsController#commits.json`</br>
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/209912
@flags: repo_storage, dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointPath } from "../../lib/gpt_web_functions.js";

export let endpointCount = 2
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = __ENV.ENVIRONMENT_REPO_STORAGE == "nfs" ? getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT * 0.5, endpointCount) : getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT * 0.6, endpointCount)
export let ttfbThreshold = __ENV.ENVIRONMENT_REPO_STORAGE == "nfs" ? getTtfbThreshold(3000) : getTtfbThreshold(1000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:commits}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:commits.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:commits}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:commits.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getProjects(['name', 'group']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Check if endpoint path has a dash \ redirect
  let checkProject = selectProject(projects)
  let endpointPath = checkProjEndpointPath(`${__ENV.ENVIRONMENT_URL}/${checkProject['group']}/${checkProject['name']}`, 'merge_requests')
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}

export default function(data) {
  group("Web - Merge Request Commits Page", function() {
    let project = selectProject(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/${data.endpointPath}/${project['mr_commits_iid']}/commits`, null, {tags: {endpoint: 'commits', controller: 'Projects::MergeRequestsController', action: 'show'}}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/${data.endpointPath}/${project['mr_commits_iid']}/commits.json`, null, {tags: {endpoint: 'commits.json', controller: 'Projects::MergeRequestsController', action: 'commits.json'}}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
