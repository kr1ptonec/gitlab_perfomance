/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/blob/master/:file_path`
@example_uri: /:unencoded_path/blob/master/:file_source_path
@description: Web - Project File Source. <br>Controllers: `Projects::BlobController#show`, `Projects::BlobController#show.json`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/247878
@previous_issues: https://gitlab.com/gitlab-org/quality/performance-sitespeed/-/issues/11
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { '13.11.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.1, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.1 },
  'ttfb': { '13.11.0': 5000, 'latest': 1700 }
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
    "http_req_waiting{endpoint:file}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:file?format=json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:file}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:file?format=json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'unencoded_path', 'file_source_path']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Project File Source", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/blob/master/${project['file_source_path']}`, null, {tags: {endpoint: 'file', controller: 'Projects::BlobController', action: 'show'}, responseType: 'none', redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/blob/master/${project['file_source_path']}?format=json`, null, {tags: {endpoint: 'file?format=json', controller: 'Projects::BlobController', action: 'show.json'}, responseType: 'none', redirects: 0}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
