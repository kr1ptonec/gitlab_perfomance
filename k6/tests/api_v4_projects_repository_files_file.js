/*global __ENV : true  */

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, selectProject } from "./modules/custom_k6_modules.js";

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not be set. Exiting...')

export let rpsThresholds = getRpsThresholds()
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = JSON.parse(open(`../environments/${__ENV.ENVIRONMENT_NAME}.json`))['projects'];

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Project Repository File", function() {
    let project = selectProject(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/repository/files/${project['file_path']}?ref=master`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}