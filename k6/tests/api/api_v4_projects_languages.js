/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/languages`
@description: [Get languages used in a project with percentage value](https://docs.gitlab.com/ee/api/projects.html#languages)
*/

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getProjects, selectProject } from "../../lib/gpt_k6_modules.js";

// Token not typically required for this endpoint but it was in 11.10 \ 11.11 dur to a bug
// https://gitlab.com/gitlab-org/gitlab-foss/issues/60425
if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not been set. Skipping...')

export let rpsThresholds = getRpsThresholds()
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getProjects(['name', 'group']);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Project Languages List", function() {
    let project = selectProject(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/languages`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
