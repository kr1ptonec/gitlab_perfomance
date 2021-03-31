/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/issues/:issue_iid`
@description: Web - Project Issue Page. <br>Controllers: `Projects::IssuesController#show`, `Projects::IssuesController#discussions`, `Projects::IssuesController#related_branches`, `Projects::IssuesController#can_create_branch` </br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/211377
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'ttfb': { 'latest': 1500 }
};
export let endpointCount = 5
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT, endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:issue}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:realtime_changes}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:discussions.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:related_branches}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:can_create_branch}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:issue}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:realtime_changes}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:discussions.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:related_branches}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:can_create_branch}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'unencoded_path', 'issue_iid']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Check if endpoint path has a dash \ redirect
  let checkProject = selectRandom(projects)
  let endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, 'issues')
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}

export default function(data) {
  group("Web - Project Issue Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['issue_iid']}`, null, {tags: {endpoint: 'issue', controller: 'Projects::IssuesController', action: 'show'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['issue_iid']}/realtime_changes`, null, {tags: {endpoint: 'realtime_changes', controller: 'Projects::IssuesController', action: 'realtime_changes'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['issue_iid']}/discussions.json`, null, {tags: {endpoint: 'discussions.json', controller: 'Projects::IssuesController', action: 'discussions.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['issue_iid']}/related_branches`, null, {tags: {endpoint: 'related_branches', controller: 'Projects::IssuesController', action: 'related_branches'}, headers: { 'Accept': 'application/json' }, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['issue_iid']}/can_create_branch`, null, {tags: {endpoint: 'can_create_branch', controller: 'Projects::IssuesController', action: 'can_create_branch'}, headers: { 'Accept': 'application/json' }, redirects: 0}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
