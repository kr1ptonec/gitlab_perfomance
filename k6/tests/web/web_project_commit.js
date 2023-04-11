/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/commit/:commit_sha`
@example_uri: /:unencoded_path/commit/:commit_sha
@description: Web - Commit Details Page. <br>Controllers: `Projects::CommitController#show`, `Projects::CommitController#branches`, `Projects::CommitController#merge_requests.json`, `Projects::CommitController#diff_files` </br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/333292
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/232509, https://gitlab.com/gitlab-org/gitlab/-/issues/322559
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom, envVersionIsHigherThan } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

// Send request to pull diff files for commit
let loadDiffFiles = envVersionIsHigherThan('15.11.0') ? true : false

export let thresholds = {
  'rps': { '13.9.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.2, '14.0.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.2, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.4 },
  'ttfb': { '13.9.0': 12500, '14.0.0': 10000, 'latest': 3500 }
};
export let endpointCount = loadDiffFiles ? 4 : 3;
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let optionThresholds = {
  "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
  "http_req_waiting{controller:Projects::CommitController#show}": [`p(90)<${ttfbThreshold}`],
  "http_req_waiting{controller:Projects::CommitController#branches}": [`p(90)<${ttfbThreshold}`],
  "http_req_waiting{controller:Projects::CommitController#merge_requests.json}": [`p(90)<${ttfbThreshold}`],
  "http_reqs": [`count>=${rpsThresholds['count']}`],
  "http_reqs{controller:Projects::CommitController#show}": [`count>=${rpsThresholds['count_per_endpoint']}`],
  "http_reqs{controller:Projects::CommitController#branches}": [`count>=${rpsThresholds['count_per_endpoint']}`],
  "http_reqs{controller:Projects::CommitController#merge_requests.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
}
if (loadDiffFiles) {
  optionThresholds["http_req_waiting{controller:Projects::CommitController#diff_files}"] = [`p(90)<${ttfbThreshold}`];
  optionThresholds["http_reqs{controller:Projects::CommitController#diff_files}"] = [`count>=${rpsThresholds['count_per_endpoint']}`];
}
export let options = {
  thresholds: optionThresholds,
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
    let commitRequests = [
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}`, null, { tags: { controller: 'Projects::CommitController#show' }, responseType: 'none', redirects: 0 }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/branches`, null, { tags: { controller: 'Projects::CommitController#branches' }, responseType: 'none', redirects: 0 }],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/merge_requests.json`, null, { tags: { controller: 'Projects::CommitController#merge_requests.json' }, responseType: 'none', redirects: 0 }]
    ];
    if (loadDiffFiles) {
      commitRequests.push( ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/diff_files`, null, { tags: { controller: 'Projects::CommitController#diff_files' }, responseType: 'none', redirects: 0 }])
    }
    let responses = http.batch(commitRequests);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
