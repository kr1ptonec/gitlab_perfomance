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
  group("API - Group Projects List", function() {
    let params = { headers: { "Accept": "application/json" } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${__ENV.PROJECT_GROUP}/projects`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
