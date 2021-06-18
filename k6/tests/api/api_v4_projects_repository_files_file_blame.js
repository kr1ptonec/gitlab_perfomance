/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/repository/files/:file_path/blame?ref=master`
@example_uri: /api/v4/projects/:encoded_path/repository/files/:file_blame_path/blame?ref=master
@description: [Get blame information about file in repository](https://docs.gitlab.com/ee/api/repository_files.html#get-file-blame-from-repository)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/217570
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";

export let thresholds = {
  'rps': { 'latest': 0.01 },
  'ttfb': { 'latest': 35000 },
};
export let rpsThresholds = getRpsThresholds(thresholds['rps'])
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>0.15`], // Endpoint fails on 1k and 2k environments, more details in https://gitlab.com/gitlab-org/gitlab/-/issues/217570#note_595648625
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['encoded_path', 'file_blame_path']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: 15%`)
}

export default function() {
  group("API - Project Repository File Blame", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, responseType: 'none' };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/repository/files/${project['file_blame_path']}/blame?ref=master`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
