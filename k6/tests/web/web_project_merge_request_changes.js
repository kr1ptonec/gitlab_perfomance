/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/merge_requests/:merge_request_iid/diffs`
@description: Web - Project Merge Request Changes Page. <br>Controllers: `Projects::MergeRequestsController#show`, `Projects::MergeRequests::DiffsController#diffs_metadata.json`, `Projects::MergeRequests::DiffsController#diffs_batch.json`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/229164, https://gitlab.com/gitlab-org/gitlab/-/issues/331421
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/209786
@gitlab_version: 12.8.0
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'rps': { '13.2.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.4, '13.10.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.5, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT },
  'ttfb': { '13.2.0': 5000, '13.10.0': 4000, 'latest': 1500 }
};
export let endpointCount = 7
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:show}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:diffs_metadata.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:diffs_batch.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:show}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:diffs_metadata.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:diffs_batch.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
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
  let endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, 'merge_requests')
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}

export default function(data) {
  group("Web - Merge Request Changes Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_changes_iid']}/diffs`, null, {tags: {endpoint: 'show', controller: 'Projects::MergeRequestsController', action: 'show'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_changes_iid']}/diffs_metadata.json?`, null, {tags: {endpoint: 'diffs_metadata.json', controller: 'Projects::MergeRequests::DiffsController', action: 'diffs_metadata.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_changes_iid']}/diffs_batch.json?w=0&per_page=20&page=1`, null, {tags: {endpoint: 'diffs_batch.json', controller: 'Projects::MergeRequests::DiffsController', action: 'diffs_batch.json'}, redirects: 0}],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });

    let seqDiffRes = null
    for (let i = 2; i <= 5; i++) {
      seqDiffRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_changes_iid']}/diffs_batch.json?w=0&per_page=20&page=${i}`, {tags: {endpoint: 'diffs_batch.json', controller: 'Projects::MergeRequests::DiffsController', action: 'diffs_batch.json'}, redirects: 0});
      /20(0|1)/.test(seqDiffRes.status) ? successRate.add(true) : (successRate.add(false), logError(seqDiffRes));
    }
  });
}
