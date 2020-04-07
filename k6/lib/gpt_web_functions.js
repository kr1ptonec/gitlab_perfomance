import http from "k6/http";
import { fail } from "k6";

/* Certain Project Endpoint Paths can have an additional dash (-) depending on GitLab version.
When this is the case some will redirect if that dash is missing, which inflates k6's numbers
as they count redirects twice.
This function can be used to check if an endpoint path does redirect and pass that back into
the test and maintain the numbers. */
export function checkProjEndpointPath(projectPath, endpointPath) {
  let res = http.get(`${projectPath}/${endpointPath}`);
  if (!/20(0|1)/.test(res.status)) fail(`Failed to check if Project Endpoint path '${projectPath}/${endpointPath}' is correct - ${res.body}`);
  console.log(`Endpoint full URL is ${res.url}`)

  let pathRegex = new RegExp(`${projectPath}/(.*)`);
  let actualPath = res.url.match(pathRegex)[1];

  return actualPath
}