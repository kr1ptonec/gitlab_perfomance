/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/commits/:branch`
@description: Web - Project Commits Page. <br>Controllers: `CommitsController#show`</br>
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/211709
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { getRps, getRpsThreshold, getScenario, getTtfbThreshold, getDuration} from "../../lib/gpt_test_config.js";

export let rps = getRps('web')
export let rpsThreshold = getRpsThreshold('web')
export let scenario = getScenario('web')
export let duration = getDuration()
export let ttfbThreshold = getTtfbThreshold(750)
export let successRate = new Rate("successful_requests")
export let options = {
  scenarios: scenario,
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting{endpoint:commits}": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`rate>=${rpsThreshold}`],
    "http_reqs{endpoint:commits}": [`rate>=${rpsThreshold}`]
  }
};

export let projects = getLargeProjects(['name', 'group_path_web']);

export function setup() {
  console.log(`Web Protocol RPS: ${rps}`)
  console.log(`RPS Threshold: ${rpsThreshold}/s`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
  console.log(`Duration: ${duration}`)
}

export default function() {
  group("Web - Project Commits Page", function() {
    let project = selectRandom(projects);

    let responses = http.batch([
      ["GET", `${__ENV.ENVIRONMENT_URL}/${project['group_path_web']}/${project['name']}/commits/master`, null, {tags: {endpoint: 'commits', controller: 'Projects::CommitsController', action: 'show'}, redirects: 0}]
    ]);
    responses.forEach(function(res) {
      /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
  });
}
