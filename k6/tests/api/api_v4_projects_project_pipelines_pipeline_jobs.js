/*global __ENV : true  */
/*
@endpoint: `GET /projects/:id/pipelines/:pipeline_id/jobs`
@example_uri: /api/v4/projects/:id/pipelines/:pipeline_id/jobs
@description: [Get a list pipeline jobs](https://docs.gitlab.com/ee/api/jobs.html#list-pipeline-jobs)
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/345636
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, getLargeProjects, selectRandom } from "../../lib/gpt_k6_modules.js";
import { getPipelineId } from "../../lib/gpt_data_helper_functions.js";

export let thresholds = {
  'rps': { 'latest': 0.2 },
  'ttfb': { 'latest': 2000 },
};

export let rpsThresholds = getRpsThresholds()
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_req_waiting": [`p(90)<${ttfbThreshold}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export let projects = getLargeProjects(['encoded_path', 'pipeline_sha',]);

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

  // Get pipeline ID from pipeline SHA
  projects.forEach(project => { project.pipelineId = getPipelineId(project['encoded_path'], project['pipeline_sha']); });
  return projects;
}

export default function(projects) {
  group("API - Pipeline Jobs List", function() {
    let project = selectRandom(projects);

    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/pipelines/${project.pipelineId}/jobs`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
  });
}
