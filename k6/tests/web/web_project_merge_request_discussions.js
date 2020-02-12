/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/-/merge_requests/:merge_request_iid`
@description: Web - Project Merge Request Discussions Page. <br>Controllers: `Projects::MergeRequestsController#show`, `Projects::MergeRequests::ContentController#widget.json`, `Projects::MergeRequestsController#discussions.json`</br>
@issue: https://gitlab.com/gitlab-org/gitlab/issues/30507
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 3
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT * 0.7, endpointCount)
export let ttfbThreshold = getTtfbThreshold(4000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:merge_request}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:discussions.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:widget.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:merge_request}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:discussions.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:widget.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
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
}

export default function() {
  group("Web - Project Merge Request Discussions Page", function() {
    let project = selectProject(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/-/merge_requests/${project['mr_discussions_iid']}`, null, {tags: {endpoint: 'merge_request', controller: 'Projects::MergeRequestsController', action: 'show'}}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/-/merge_requests/${project['mr_discussions_iid']}/discussions.json`, null, {tags: {endpoint: 'discussions.json', controller: 'Projects::MergeRequestsController', action: 'discussions.json'}}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/-/merge_requests/${project['mr_discussions_iid']}/widget.json`, null, {tags: {endpoint: 'widget.json', controller: 'Projects::MergeRequests::ContentController', action: 'widget.json'}}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
