/*global __ENV : true  */
/*
@endpoint: `GET /:group/:project/blob/master/:file_path`
@description: Web - Projects Blob Controller Show HTML
*/

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds } from "../modules/custom_k6_modules.js";

export let rpsThresholds = getRpsThresholds()
export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": [`rate>${__ENV.SUCCESS_RATE_THRESHOLD}`],
    "http_reqs": [`count>=${rpsThresholds['count']}`]
  }
};

export function setup() {
  console.log('')
  console.log(`RPS Threshold: ${rpsThresholds['mean']}/s (${rpsThresholds['count']})`)
  console.log(`Success Rate Threshold: ${parseFloat(__ENV.SUCCESS_RATE_THRESHOLD)*100}%`)
}

export default function() {
  group("Web - Projects Blob Controller Show HTML", function() {
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${__ENV.PROJECT_GROUP}/${__ENV.PROJECT_NAME}/blob/master/${__ENV.PROJECT_FILE_PATH}`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
