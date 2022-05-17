/* global __ENV */
/*
@endpoint: `POST /groups`
@description: Setup stage: Create a parent group for subgroup(s) <br>Test: Create a subgroup <br>Teardown stage: Delete subgroup's parent group
@gpt_data_version: 1
@issue: https://gitlab.com/gitlab-org/gitlab/-/issues/361365
@flags: unsafe
*/

import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold, adjustRps, adjustStageVUs } from "../../lib/gpt_k6_modules.js";
import { searchAndCreateGroup, createGroup, deleteGroup } from "../../lib/gpt_scenario_functions.js";

export let thresholds = {
  'rps': { 'latest': __ENV.SCENARIO_ENDPOINT_THROUGHPUT * 0.02 },
  'ttfb': { 'latest': 9000 }
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

    let subGroupParentGroupId = searchAndCreateGroup("parent-group-api-v4");
    let subGroupName = "subgroup-api-v4";
    let data = { subGroupName, subGroupParentGroupId };
    return data;
}

export default function (data) {
    group("API - Create Group", function () {
        let res = createGroup(data.subGroupName, data.subGroupParentGroupId);
        /20(0|1)/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
}

export function teardown(data) {
    deleteGroup(data.subGroupParentGroupId);
}
