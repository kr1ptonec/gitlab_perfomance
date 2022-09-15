/*global __ENV : true  */
import http from "k6/http";
import { fail } from "k6";

/* Certain Project Endpoint Paths can have an additional dash (-) depending on GitLab version.
When this is the case some will redirect if that dash is missing, which inflates k6's numbers
as they count redirects twice.
This function can be used to check if an endpoint path does redirect and pass that back into
the test and maintain the numbers. */
export function checkProjEndpointDash(projectUrl, endpointPath) {
  console.log(`Check if Endpoint URL '${projectUrl}/${endpointPath}' uses dash on GitLab Environment...`)
  let res = http.get(`${projectUrl}/-/${endpointPath}`, { redirects: 0 });
  if (/20(0|1)/.test(res.status)) return `-/${endpointPath}`

  res = http.get(`${projectUrl}/${endpointPath}`, { redirects: 0 });
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

// Pipelines //
/* Pipeline IDs will differ per environment depending on previous pipelines.
Function retrieves specific pipeline ID by associated commit SHA. */
export function getPipelineId(projectId, pipelineSHA) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}/pipelines?sha=${pipelineSHA}`, params);
  let foundPipeline = JSON.parse(res.body)[0]; // get the first search result
  let pipelineId = foundPipeline && foundPipeline["id"];
  pipelineId ? console.log(`Pipeline with SHA '${pipelineSHA}' has id=${pipelineId}`) : console.log(`No pipelines containing SHA: '${pipelineSHA}'`);
  return pipelineId;
}

//Returns vulnerabilities project group
export function getVulnerabilitiesGroup() {
  let vulnerabilities_group = JSON.parse(__ENV.ENVIRONMENT_VULNERABILITIES_GROUP);
  console.log(`group_with_projects: ${JSON.stringify(vulnerabilities_group)}`)
  return vulnerabilities_group["group_name"]
}

// Group id //
/* Retrieves for group id from group name */
export function getGroupId(groupName) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups?search=${groupName}`, params);
  let foundGroup = JSON.parse(res.body)[0]; // get the first search result
  let groupId = foundGroup && foundGroup["id"];
  groupId ? console.log(`Group with name '${groupName}' has id=${groupId}`) : console.log(`No Groups with name: '${groupName}'`);
  return groupId;
}

// Get projects belonging to a group
export function getProjects(groupId){
  let project_paths = []
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${groupId}/projects`, params);
  let projects = JSON.parse(res.body);
  projects.forEach(item => project_paths.push(item["path_with_namespace"]))
  console.log(`project_paths: '${project_paths}'`)
  return project_paths
}

/* Get projects where vulnerabilities test data is present,
it picks the vulnerabilities group from k6/config/environments/*.json */

export function getVulnerabilitiesProjects(){
  let groupName = getVulnerabilitiesGroup()
  let groupId = getGroupId(groupName)
  return getProjects(groupId)
}


