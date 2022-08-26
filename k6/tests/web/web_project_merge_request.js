/*global __ENV, __VU : true  */
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
import { group, check } from "k6";
import ws from 'k6/ws';
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { checkProjEndpointDash } from "../../lib/gpt_data_helper_functions.js";

const sessionDuration = 10000;

export let thresholds = {
  'rps': { '14.4.0': __ENV.WEB_ENDPOINT_THROUGHPUT * 0.4, 'latest': __ENV.WEB_ENDPOINT_THROUGHPUT },
  'ttfb': { '14.4.0': 7500, 'latest': 1800 }
};
export let endpointCount = 5
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
  scenarios: {
    closed_model: {
      executor: 'constant-vus',
      vus: __ENV.GPT_RPS,
      duration: __ENV.GPT_TEST_DURATION,
    },
  },
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

  let websocketUrl = `ws://${__ENV.ENVIRONMENT_URL.replace(/^https?:\/\//, '')}/-/cable`;

  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${checkProject['encoded_path']}/merge_requests/${checkProject['mr_discussions_iid']}`, params);
  let mergeRequestID = JSON.parse(res.body)['id'];
  console.log(`Merge Request ID is '${mergeRequestID}'`)
  return { endpointPath, websocketUrl, mergeRequestID };
}

export default function(data) {
  group("Web - Project Merge Request Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}`, null, {tags: {controller: 'Projects::MergeRequestsController#show'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/discussions.json`, null, {tags: {controller: 'Projects::MergeRequestsController#discussions.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/widget.json?async_mergeability_check=true`, null, {tags: {controller: 'Projects::MergeRequests::ContentController#widget.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}/cached_widget.json`, null, {tags: {controller: 'Projects::MergeRequests::ContentController#cached_widget.json'}, redirects: 0}],
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}/${data.endpointPath}/${project['mr_discussions_iid']}.json?serializer=sidebar_extras`, null, {tags: {controller: 'Projects::MergeRequestsController#show.json'}, redirects: 0}],
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });

    let params = { headers: { "Origin": `${__ENV.ENVIRONMENT_URL}` } };
    const res = ws.connect(data.websocketUrl, params, function (socket) {
      socket.on('open', function open() {
        console.log(`VU ${__VU}: connected`);

        socket.send(JSON.stringify({ command: 'subscribe', identifier:  `{"channel":"GraphqlChannel","query":"subscription issuableLabelsUpdatedEE($issuableId: IssuableID!) {\\n  issuableLabelsUpdated(issuableId: $issuableId) {\\n    ... on Issue {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    ... on MergeRequest {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    ... on Epic {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment Label on Label {\\n  id\\n  title\\n  description\\n  color\\n  textColor\\n  __typename\\n}\\n","variables":{"issuableId":"gid://gitlab/MergeRequest/${data.mergeRequestID}"},"operationName":"issuableLabelsUpdatedEE","nonce":"8f9548b9-6dd1-4879-9230-551ea264c801"}`}));

      });

      socket.on('message', (data) => console.log('Message received: ', data));
      socket.on('close', () => console.log('disconnected'));

      socket.setTimeout(function () {
        console.log(`VU ${__VU}: ${sessionDuration}ms passed, closing MR`);
        socket.send(JSON.stringify({ event: 'LEAVE' }));
      }, sessionDuration);

      socket.setTimeout(function () {
        console.log(`Closing the socket forcefully 3s after graceful LEAVE`);
        socket.close();
      }, sessionDuration + 3000);
    });

    check(res, { 'Connected successfully': (r) => r && r.status === 101 });
  });
}
