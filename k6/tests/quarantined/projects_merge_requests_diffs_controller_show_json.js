/*global __ENV : true  */

import http from "k6/http";
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError } from "./modules/log_error.js";

export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": ["rate>0.95"],
  }
};

export default function() {
  group("Web - Merge Request Diffs Controller Show JSON", function() {
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/${__ENV.PROJECT_GROUP}/${__ENV.PROJECT_NAME}/merge_requests/${__ENV.PROJECT_MR_COMMITS_IID}/diffs.json`);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}