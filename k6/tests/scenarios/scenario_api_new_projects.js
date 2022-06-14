/* global __ENV */
/*
@endpoint: `POST /projects`
@description: Setup stage: Create a group for the project <br>Test: Create a project <br>Teardown stage: Delete group with project
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/362390
@flags: unsafe
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { searchAndCreateGroup, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let thresholds = {
    'rps': { 'latest': __ENV.SCENARIO_ENDPOINT_THROUGHPUT * 0.05 },
    'ttfb': { 'latest': 7000 }
}
export let rps = adjustRps(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let stages = adjustStageVUs(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let rpsThresholds = getRpsThresholds(__ENV.SCENARIO_ENDPOINT_THROUGHPUT)
export let ttfbThreshold = getTtfbThreshold(thresholds['ttfb'])
export let successRate = new Rate("successful_requests")
export let options = {
    thresholds: {
        "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
        "http_req_waiting": [`p(90)<${ttfbThreshold}`],
        "http_reqs": [`count>=${rpsThresholds['count']}`]
    },
    stages: stages,
    rps: rps
};

export function setup() {
    console.log('')
    console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
    console.log(`TTFB P90 Threshold: ${ttfbThreshold}ms`)
    console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)

    let groupId = searchAndCreateGroup("group-api-v4-create-project");
    let data = { groupId };
    return data;
}

export default function (data) {
    group("API - Create Project", function () {
        let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
        let formdata = {
            name: `project-api-v4-${Date.now()}`,
            namespace_id: data.groupId,
            auto_devops_enabled: false,
            visibility: "public",
            default_branch: "main",
            initialize_with_readme: true
        };
        let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects`, formdata, params);
        /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
}

export function teardown(data) {
    deleteGroup(data.groupId);
}
