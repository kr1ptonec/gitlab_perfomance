/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/-/merge_requests/:merge_request_iid/diffs`
@description: Web - Project Merge Request Changes Page. <br>Controllers: `Projects::MergeRequestsController#show`, `Projects::MergeRequests::DiffsController#diffs_metadata.json`, `Projects::MergeRequests::DiffsController#diffs_batch.json`</br>
@issue: https://gitlab.com/gitlab-org/gitlab/issues/30507
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

export let endpointCount = 7
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THROUGHPUT * 0.5, endpointCount)
export let ttfbThreshold = getTtfbThreshold(3000)
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:diffs}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:diffs_metadata.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:diffs_batch.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:diffs}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:diffs_metadata.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:diffs_batch.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
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
  group("Web - Merge Request Changes Page", function() {
    let project = selectProject(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/-/merge_requests/${project['mr_commits_iid']}/diffs`, null, {tags: {endpoint: 'diffs', controller: 'Projects::MergeRequestsController', action: 'show'}}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/-/merge_requests/${project['mr_commits_iid']}/diffs_metadata.json?`, null, {tags: {endpoint: 'diffs_metadata.json', controller: 'Projects::MergeRequests::DiffsController', action: 'diffs_metadata.json'}}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/-/merge_requests/${project['mr_commits_iid']}/diffs_batch.json?w=0&per_page=20&page=1`, null, {tags: {endpoint: 'diffs_batch.json', controller: 'Projects::MergeRequests::DiffsController', action: 'diffs_batch.json'}}],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });

    let pageRes = null
    for (let i = 2; i <= 5; i++) {
      pageRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/-/merge_requests/${project['mr_commits_iid']}/diffs_batch.json?w=0&per_page=20&page=${i}`, {tags: {endpoint: 'diffs_batch.json', controller: 'Projects::MergeRequests::DiffsController', action: 'diffs_batch.json'}});
      /20(0|1)/.test(pageRes.status) ? successRate.add(true) : (successRate.add(false), logError(pageRes));
    }
  });
}