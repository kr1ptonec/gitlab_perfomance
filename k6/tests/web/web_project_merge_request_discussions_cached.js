/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/merge_requests/:merge_request_iid`
@example_uri: /:unencoded_path/merge_requests/:mr_discussions_iid
@description: Web - Project Merge Request Cached discussions stored in Redis. <br> `Projects::MergeRequestsController#discussions.json` </br>
@gpt_data_version: 1
@issue: // TODO ??
@gitlab_version: 15.10.0
@flags: dash_url
*/

// TODO only run if scenario? only run discussion endpoints? endpoint count??

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";
import exec from 'k6/execution';

export let thresholds = {
  'rps': { 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT },
  'ttfb': { 'latest': 3000 }
};
export let endpointCount = 5; // or 6??
export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{controller:Projects::MergeRequestsController#discussions.json}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{controller:Projects::MergeRequestsController#discussions_cached_etag}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{controller:Projects::MergeRequestsController#discussions.json}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{controller:Projects::MergeRequestsController#discussions_cached_etag}": [`count>=${rpsThresholds['count_per_endpoint']}`],
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getLargeProjects(['name', 'unencoded_path']);
export let etags = Array(options.rps + 1); // rps + 1 because VU/ITER starts from 0

// Contains all etags for MR discussion paginated results for each Page sizes - 20, 30, 45, 68, 100
// rps + 1 because VU/ITER starts from 0
export let etagsAll = {
  20: Array(options.rps + 1),
  30: Array(options.rps + 1),
  45: Array(options.rps + 1),
  68: Array(options.rps + 1),
  100: Array(options.rps + 1)
}

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
  group("Web - Project Merge Request Cached discussions pages", function() {
    let project = selectRandom(projects);

    // Load in dynamic comments sequentially as page does
    let pagePaginationBase = 20;
    let paginateParameter = `?per_page=${pagePaginationBase}`;
    let discussRes = null

    // Save and reuse etag from first time page was opened by VU
    // https://gitlab.com/gitlab-org/quality/performance/-/issues/524#note_1108446379
    // https://gitlab.com/gitlab-org/quality/performance/-/merge_requests/493#note_1301535301
    if (exec.vu.iterationInScenario === 0) {
      discussRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/discussions.json${paginateParameter}`, {tags: {controller: 'Projects::MergeRequestsController#discussions.json'}, redirects: 0});
      etagsAll[20][exec.vu.idInTest] = discussRes.headers['Etag']; // save etag for this virtual user
    } else {
      const firstPageEtag = etagsAll[20][exec.vu.idInTest]; // get saved etag for this virtual user
      let params = { headers: { "If-None-Match": firstPageEtag }, tags: {controller: 'Projects::MergeRequestsController#discussions_cached_etag'}, redirects: 0 };
      discussRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/discussions.json${paginateParameter}`, params);
      /20(0|1)|304/.test(discussRes.status) ? successRate.add(true) : (successRate.add(false), logError(discussRes));
    }

    // Get all paginated results
    // https://gitlab.com/gitlab-org/gitlab/-/issues/211377#note_1010122411
    let nextPageCursor = discussRes.headers['X-Next-Page-Cursor'];
    let seqDiscussionRes = null;
    let pageEtag = null

    while (nextPageCursor) {
      pagePaginationBase = Math.ceil(pagePaginationBase * 1.5) // Page sizes: 20, 30, 45, 68, 100
      // Save and reuse etag from first time page was opened by VU
      if (exec.vu.iterationInScenario === 0) {
        seqDiscussionRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/discussions.json?per_page=${pagePaginationBase}&cursor=${nextPageCursor}`, {tags: {controller: 'Projects::MergeRequestsController#discussions.json'}, redirects: 0});
        etagsAll[pagePaginationBase][exec.vu.idInTest] = seqDiscussionRes.headers['Etag'];
      } else {
        pageEtag = etagsAll[pagePaginationBase][exec.vu.idInTest]
        let params = { headers: { "If-None-Match": pageEtag }, tags: {controller: 'Projects::MergeRequestsController#discussions_cached_etag'}, redirects: 0 };
        seqDiscussionRes = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/discussions.json?per_page=${pagePaginationBase}&cursor=${nextPageCursor}`, params);
        /20(0|1)|304/.test(seqDiscussionRes.status) ? successRate.add(true) : (successRate.add(false), logError(seqDiscussionRes));
      }
      nextPageCursor = seqDiscussionRes.headers['X-Next-Page-Cursor'];
    }
  });
}
