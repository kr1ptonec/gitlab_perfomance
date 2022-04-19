/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/commit/:commit_sha`
@example_uri: /:unencoded_path/commit/:commit_sha
@description: Web - Commit Details Page. <br>Controllers: `Projects::CommitController#show`, `Projects::CommitController#branches`, `Projects::CommitController#merge_requests.json`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/333292
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/232509, https://gitlab.com/gitlab-org/gitlab/-/issues/322559
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'rps': { '13.9.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.2, '14.0.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.2, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.4 },
  'ttfb': { '13.9.0': 12500, '14.0.0': 10000, 'latest': 3000 }
};
export let endpointCount = 3
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:commit}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:branches}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:merge_requests.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:commit}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:branches}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:merge_requests.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'unencoded_path', 'commit_sha']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Check if endpoint path has a dash \ redirect
  let checkProject = selectRandom(projects)
  let endpointPath = checkProjEndpointDash(`${__ENV.ENVIRONMENT_URL}/${checkProject['unencoded_path']}`, `commit/${checkProject['commit_sha']}`)
  console.log(`Endpoint path is '${endpointPath}'`)
  return { endpointPath };
}

export default function(data) {
  group("Web - Commit Details Page", function() {
    let project = selectRandom(projects);
    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}`, null, { tags: { endpoint: 'commit', controller: 'Projects::CommitController', action: 'show' }, responseType: 'none', redirects: 0 }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/branches`, null, { tags: { endpoint: 'branches', controller: 'Projects::CommitController', action: 'branches' }, responseType: 'none', redirects: 0 }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/merge_requests.json`, null, { tags: { endpoint: 'merge_requests.json', controller: 'Projects::CommitController', action: 'merge_requests.json' }, responseType: 'none', redirects: 0 }]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
