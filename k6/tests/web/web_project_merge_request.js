/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/merge_requests/:merge_request_iid`
@example_uri: /:unencoded_path/merge_requests/:mr_discussions_iid
@description: Web - Project Merge Request Page. <br>Controllers: `Projects::MergeRequestsController#show`, `Projects::MergeRequestsController#show.json`, `Projects::MergeRequestsController#discussions.json`, `Projects::MergeRequests::ContentController#widget.json`, `Projects::MergeRequests::ContentController#cached_widget.json`</br>
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/342612, https://gitlab.com/gitlab-org/gitlab/-/issues/331421
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/209784
@gitlab_version: 12.2.0
@flags: dash_url
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom, envVersionIsHigherThan } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

let paginateDiscussions = envVersionIsHigherThan('15.3.0') ? true : false

export let thresholds = {
  'rps': { '14.4.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.4, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT },
  'ttfb': { '14.4.0': 7500, 'latest': 1800 }
};
export let endpointCount = paginateDiscussions ? 8 : 5;
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{controller:Projects::MergeRequestsController#show}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::MergeRequestsController#discussions.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::MergeRequests::ContentController#widget.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::MergeRequests::ContentController#cached_widget.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::MergeRequestsController#show.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{controller:Projects::MergeRequestsController#show}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::MergeRequestsController#discussions.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::MergeRequests::ContentController#widget.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::MergeRequests::ContentController#cached_widget.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::MergeRequestsController#show.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
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
  group("Web - Project Merge Request Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}`, null, {tags: {controller: 'Projects::MergeRequestsController#show'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/widget.json?async_mergeability_check=true`, null, {tags: {controller: 'Projects::MergeRequests::ContentController#widget.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/cached_widget.json`, null, {tags: {controller: 'Projects::MergeRequests::ContentController#cached_widget.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}.json?serializer=sidebar_extras`, null, {tags: {controller: 'Projects::MergeRequestsController#show.json'}, redirects: 0}],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });

    // Load in dynamic comments sequentially as page does
    let pagePaginationBase = 20;
    let paginateParameter = paginateDiscussions ? `?per_page=${pagePaginationBase}` : "";
    let discussRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/discussions.json${paginateParameter}`, {tags: {controller: 'Projects::MergeRequestsController#discussions.json'}, redirects: 0});
    /20(0|1)/.test(discussRes.status) ? successRate.add(true) : (successRate.add(false), logError(discussRes));

    if (paginateDiscussions) {
      // Get all paginated results
      // https://gitlab.com/gitlab-org/gitlab/-/issues/211377#note_1010122411
      let nextPageCursor = discussRes.headers['X-Next-Page-Cursor'];
      let seqDiscussionRes = null;
      while (nextPageCursor) {
        pagePaginationBase = Math.ceil(pagePaginationBase * 1.5) // Page sizes: 20, 30, 45, 68, 100
        seqDiscussionRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/discussions.json?per_page=${pagePaginationBase}&cursor=${nextPageCursor}`, {tags: {controller: 'Projects::MergeRequestsController#discussions.json'}, redirects: 0});
        /20(0|1)/.test(seqDiscussionRes.status) ? successRate.add(true) : (successRate.add(false), logError(seqDiscussionRes));
        nextPageCursor = seqDiscussionRes.headers['X-Next-Page-Cursor'];
      }
    }
  });
}
