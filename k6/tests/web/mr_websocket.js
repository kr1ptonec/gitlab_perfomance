/*global __ENV, __VU : true  */
/*
@endpoint: `GET /:group/:project/merge_requests/:merge_request_iid`
@example_uri: /:unencoded_path/merge_requests/:mr_discussions_iid
@description: Web - Project Merge Request Page WebSocket test. <br>Controllers: `Projects::MergeRequestsController#show`, `Projects::MergeRequestsController#show.json`, `Projects::MergeRequestsController#discussions.json`, `Projects::MergeRequests::ContentController#widget.json`, `Projects::MergeRequests::ContentController#cached_widget.json`</br>
@gpt_data_version: 1
*/


import ws from 'k6/ws';
import { check } from 'k6';
import http from "k6/http";
import { getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

const sessionDuration = parseInt(__ENV.GPT_WS_SESSION_MS) || 10000; //10s user session duration
const rps_count = parseInt(__ENV.GPT_RPS) || 1;
const test_duration = __ENV.GPT_TEST_DURATION || '60s';

export const options = {
  scenarios: {
    closed_model: {
      executor: 'constant-vus',
      vus: rps_count,
      duration: test_duration,
    },
  },
};

export let projects = getLargeProjects(['name', 'unencoded_path']);

export function setup() {
  let checkProject = selectRandom(projects)
  let websocketUrl = `ws://${__ENV.ENVIRONMENT_URL.replace(/^https?:\/\//, '')}/-/cable`;
  console.log(`WebSocket URL is '${websocketUrl}', session duration ${sessionDuration/1000} seconds`)

  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${checkProject['encoded_path']}/merge_requests/${checkProject['mr_discussions_iid']}`, params);
  let mergeRequestID = JSON.parse(res.body)['id'];
  console.log(`Merge Request ID is '${mergeRequestID}'`)
  return { websocketUrl, mergeRequestID };
}

export default function (data) {
  const url = data.websocketUrl;
  let params = { headers: { "Origin": `${__ENV.ENVIRONMENT_URL}` } };

  const res = ws.connect(url, params, function (socket) {
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
}
