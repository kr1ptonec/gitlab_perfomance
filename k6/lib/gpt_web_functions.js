import http from "k6/http";
import { fail } from "k6";

/* Certain Project Endpoint Paths can have an additional dash (-) depending on GitLab version.
When this is the case some will redirect if that dash is missing, which inflates k6's numbers
as they count redirects twice.
This function can be used to check if an endpoint path does redirect and pass that back into
the test and maintain the numbers. */
export function checkProjEndpointDash(projectUrl, endpointPath) {
  console.log(`Check if Endpoint URL '${projectUrl}/${endpointPath}' uses dash on GitLab Environment...`)
  let res = http.get(`${projectUrl}/-/${endpointPath}`);
  if (/20(0|1)/.test(res.status)) return `-/${endpointPath}`

  res = http.get(`${projectUrl}/${endpointPath}`);
  if (/20(0|1)/.test(res.status)) return endpointPath
  if (/30[0-9]/.test(res.status)) {
    try {
      let pathRegex = new RegExp(`${projectUrl}/(.*)`);
      let actualPath = res.url.match(pathRegex)[1];
      return actualPath
    } catch (e) {
      fail(`Failed to extract path from redirected URL '${res.url}' - ${e}. Exiting...`);
    }
  }

  fail(`Failed to determine if Endpoint URL '${projectUrl}/${endpointPath}' is correct or uses a dash on GitLab Environment. Exiting...`);
}
