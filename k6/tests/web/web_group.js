/*global __ENV : true  */
/*
@endpoint: `GET /:group`
@example_uri: /:unencoded_group_path
@description: Web - Group Page. <br>Controllers: `GroupsController#show`, `Groups::ChildrenController#index`</br>
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/334795
@gpt_data_version: 1
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getManyGroupsOrProjects } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT },
  'ttfb': { 'latest': 400 }
};
export let endpointCount = 2
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT )
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:/}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:/children.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:/}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:/children.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let horizDataGroup = getManyGroupsOrProjects(['unencoded_group_path']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Groups Page", function() {
    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${horizDataGroup}`, null, {tags: {endpoint: '/', controller: 'GroupsController', action: 'show'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/groups/${horizDataGroup}/-/children.json`, null, {tags: {endpoint: '/children.json', controller: 'Groups::ChildrenController', action: 'index'}, redirects: 0}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
