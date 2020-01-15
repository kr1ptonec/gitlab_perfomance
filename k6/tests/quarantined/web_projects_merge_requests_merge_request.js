/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/merge_requests/:merge_request_iid`
@description: Web - Merge Request Discussions page. <br>Controllers: `Projects::MergeRequestsController`</br>
@issue: https://gitlab.com/gitlab-org/gitlab/issues/30507
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, adjustRps, adjustStageVUs, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

export let webProtoRps = adjustRps(__ENV.WEB_ENDPOINT_THRESHOLD);
export let webProtoStages = adjustStageVUs(__ENV.WEB_ENDPOINT_THRESHOLD);
export let rpsThresholds = getRpsThresholds(__ENV.WEB_ENDPOINT_THRESHOLD)
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getProjects(['name', 'group', 'mr_commits_iid']);

export function setup() {
  console.log('')
  console.log(`Web Protocol RPS: ${webProtoRps}`)
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Merge Request Discussions HTML", function() {
    let project = selectProject(projects);
  
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}/merge_requests/${project['mr_commits_iid']}`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
