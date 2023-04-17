/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/issues`
@example_uri: /api/v4/projects/:encoded_path/issues
@description: [List project issues](https://docs.gitlab.com/ee/api/issues.html#list-project-issues)
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/334434
@previous_issues: https://gitlab.com/gitlab-org/gitlab/-/issues/211373
@gpt_data_version: 1
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { '13.12.0': 0.6 },
  'ttfb': { '13.12.0': 2000, 'latest': 500 },
};
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['encoded_path']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Issues List", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };

    // all
    //let querystr = `query {\n  project(fullPath: \"${project['unencoded_path']}\") {\n    issues {\n      nodes {\n                        blocked\n                        blockedByCount\n                        blockingCount\n                        closedAt\n                        confidential\n                        createNoteEmail\n                        createdAt\n                        description\n                        discussionLocked\n                        dueDate\n                        healthStatus\n                        humanTimeEstimate\n                        id\n                        iid\n                        relativePosition\n                        state\n                        title\n                        updatedAt\n                        weight\n      }\n    }\n  }\n}\n\n`;

    // sub-fields
    //let querystr = `query {\n  project(fullPath: \"${project['unencoded_path']}\") {\n    issues {\n      nodes {\n                        closedAt\n                        confidential\n                        createdAt\n                        description\n                        dueDate\n                        healthStatus\n                        id\n                        iid\n                        moved\n                        projectId\n                        severity\n                        state\n                        title\n                        type\n                        updatedAt\n      }\n    }\n  }\n}\n\n`;

    let querystr = `query {\n  project(fullPath: \"${project['unencoded_path']}\") {\n    issues {\n      nodes {\n                        id\n                        iid\n}\n    }\n  }\n}\n\n`;
    let data = { query: querystr, variables: '' };
    let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/graphql`, data, params);
    //console.log(JSON.stringify(project), res.body);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
