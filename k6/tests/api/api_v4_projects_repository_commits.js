/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/repository/commits`
@description: [Get a list of repository commits in a project](https://docs.gitlab.com/ee/api/commits.html#list-repository-commits)
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { getRps, getRpsThreshold, getScenario, getTtfbThreshold} from "../../lib/gpt_test_config.js";

export let rps = getRps('api')
export let rpsThreshold = getRpsThreshold('api')
export let scenario = getScenario('api')
export let ttfbThreshold = getTtfbThreshold()
export let successRate = new Rate("successful_requests")
export let options = {
  scenarios: scenario,
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`rate>=${rpsThreshold}`],
  }
};

export let projects = getLargeProjects(['name', 'group_path_api']);

export function setup() {
  console.log(`API Protocol RPS: ${rps}/s`)
  console.log(`RPS Threshold: ${rpsThreshold}/s`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("API - Project Repository Commits List", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group_path_api']}%2F${project['name']}/repository/commits`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
