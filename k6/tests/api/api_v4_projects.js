/*global __ENV : true  */
/*
@endpoint: `GET /projects?order_by=id&sort=asc and GET /projects?pagination=keyset&order_by=id&sort=asc`
@example_uri: /api/v4/projects?order_by=id&sort=asc
@description: [Get a list of all projects](https://docs.gitlab.com/ee/api/projects.html#list-all-projects)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/30181, https://gitlab.com/gitlab-org/gitlab/-/issues/211495
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, versionIsLowerThanEnvVersion, getRpsThresholds, getTtfbThreshold } from "../../lib/gpt_k6_modules.js";

let endpoints = versionIsLowerThanEnvVersion('12.7.0') ? ['projects?pagination=offset', 'projects?pagination=keyset'] : ['projects?pagination=offset'];

export let thresholds = {
  'rps': { 'latest': 0.15 },
  'ttfb': { 'latest': 7000 },
};
export let endpointCount = endpoints.length
export let rpsThresholds = getRpsThresholds(thresholds['rps'], endpointCount)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")

let endpoint_thresholds = {
  "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
  "http_reqs": [`count>=${rpsThresholds['count']}`],
}
endpoints.forEach(endpoint => {
  endpoint_thresholds[`http_req_waiting{endpoint:${endpoint}}`] = [`p(90)<${ttfbThreshold}`],
  endpoint_thresholds[`http_reqs{endpoint:${endpoint}}`] = [`count>=${rpsThresholds['count_per_endpoint']}`]
})

export let options = {
  thresholds: endpoint_thresholds
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Projects List", function() {
    endpoints.forEach(endpoint => {
      let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, tags: { endpoint: endpoint } };
      let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/${endpoint}&order_by=id&sort=asc`, params);
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    })
  });
}
