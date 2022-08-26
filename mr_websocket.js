/*global __VU : true  */
import ws from 'k6/ws';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { check } from 'k6';

const sessionDuration = 10000;// randomIntBetween(3000, 10000); // user session between 1s and 6s
export let subscriptionMessage = '{"command":"subscribe","identifier":"{"channel":"GraphqlChannel","query":"subscription issuableLabelsUpdatedEE($issuableId: IssuableID!) {\\n  issuableLabelsUpdated(issuableId: $issuableId) {\\n    ... on Issue {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    ... on MergeRequest {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    ... on Epic {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment Label on Label {\\n  id\\n  title\\n  description\\n  color\\n  textColor\\n  __typename\\n}\\n","variables":{"issuableId":"gid://gitlab/MergeRequest/3143"},"operationName":"issuableLabelsUpdatedEE","nonce":"c1476f37-2ced-4cdf-bf07-9e6d1df4a07a"}"}';


export const options = {
  scenarios: {
    closed_model: {
      executor: 'constant-vus',
      vus: 1,
      duration: '60s',
    },
  },
};

export default function () {
  const url = 'ws://104.196.223.225/-/cable';
  let params = { headers: { "Origin": ` http://104.196.223.225` } };

  const res = ws.connect(url, params, function (socket) {
    socket.on('open', function open() {
      console.log(`VU ${__VU}: connected`);

      socket.send(JSON.stringify({ command: 'subscribe', identifier:  "{\"channel\":\"GraphqlChannel\",\"query\":\"subscription issuableLabelsUpdatedEE($issuableId: IssuableID!) {\\n  issuableLabelsUpdated(issuableId: $issuableId) {\\n    ... on Issue {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    ... on MergeRequest {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    ... on Epic {\\n      id\\n      labels {\\n        nodes {\\n          ...Label\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment Label on Label {\\n  id\\n  title\\n  description\\n  color\\n  textColor\\n  __typename\\n}\\n\",\"variables\":{\"issuableId\":\"gid://gitlab/MergeRequest/3143\"},\"operationName\":\"issuableLabelsUpdatedEE\",\"nonce\":\"8f9548b9-6dd1-4879-9230-551ea264c801\"}"}));

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
