/*global __ENV : true  */

import http from "k6/http";
import { group, fail } from "k6";
import { Rate } from "k6/metrics";
import { logError } from "./modules/log_error.js";

export let successRate = new Rate("successful_requests");
export let options = {
  thresholds: {
    "successful_requests": ["rate>0.95"],
  }
};

if (!__ENV.ACCESS_TOKEN) fail('ACCESS_TOKEN has not be set. Exiting...')

export default function() {
  group("API - Project Repository Tree", function() {
    let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
    let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${__ENV.PROJECT_GROUP}%2F${__ENV.PROJECT_NAME}/repository/tree`, params);
    /20(0|1)/.test(res.status) ? successRate.add(true) : successRate.add(false) && logError(res);
  });
}
