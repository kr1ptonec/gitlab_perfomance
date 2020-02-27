/*global __ENV : true  */
/*
@endpoint: `GET /profile/notifications`
@description: Web - Profile Notifications <br>Controllers: `NotificationsController#show`</br>
*/

import http from "k6/http";
import {group} from "k6";
import {Rate} from "k6/metrics";
import {
  logError,
  getRpsThresholds,
  getTtfbThreshold,
  adjustRps,
  adjustStageVUs,
  getProjects
} from "../../lib/gpt_k6_modules.js";

import {createGroup, createProject, deleteGroup} from "../../lib/gpt_scenario_functions.js";

const NUM_GROUPS = 1300;

export let endpointCount = 1;
export let webProtoRps = adjustRps(__ENV["WEB_ENDPOINT_THROUGHPUT"] * 0.6);
export let webProtoStages = adjustStageVUs(__ENV["WEB_ENDPOINT_THROUGHPUT"] * 0.6);
export let rpsThresholds = getRpsThresholds(__ENV["WEB_ENDPOINT_THROUGHPUT"] * 0.6, endpointCount);
export let ttfbThreshold = getTtfbThreshold(4000);
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV['SUCCESS_RATE_THRESHOLD']}`],
    "http_req_waiting{endpoint:user}": [`p(90)<${ttfbThreshold}`],
    "http_req_waiting{endpoint:calendar.json}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`],
    "http_reqs{endpoint:user}": [`count>=${rpsThresholds['count_per_endpoint']}`],
    "http_reqs{endpoint:calendar.json}": [`count>=${rpsThresholds['count_per_endpoint']}`]
  },
  rps: webProtoRps,
  stages: webProtoStages
};

export let projects = getProjects(['user']);

export function setup() {
  console.log('');
  console.log(`Web Protocol RPS: ${webProtoRps}`);
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`);
  console.log(`RPS Threshold per Endpoint: ${rpsThresholds['mean_per_endpoint']}/s (${rpsThresholds['count_per_endpoint']})`);
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`);
  console.log(`Success Rate Threshold: ${parseFloat(__ENV["SUCCESS_RATE_THRESHOLD"]) * 100}%`);

  let parentGroupId = createGroup('profile-notifications-group');

  let groupId;
  for (let idx = 0; idx < NUM_GROUPS; idx++) {
    groupId = createGroup(`profile-notifications-group-${idx}`, parentGroupId);
    createProject(groupId);
  }

  return parentGroupId;
}

export function teardown(parentGroupId) {
  deleteGroup(parentGroupId);
}

export default () => {
  group("Web - Profile Notifications", () => {
    let responses = http.batch([
      ["GET", `${__ENV["ENVIRONMENT_URL"]}/profile/notifications`, null, {
        tags: {
          endpoint: 'notifications',
          controller: 'NotificationsController',
          action: 'show'
        }
      }]
    ]);
    responses.forEach((res) => {
      /20([01])/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
