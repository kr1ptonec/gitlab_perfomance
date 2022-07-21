/*global __ENV : true  */
import http from "k6/http";
import { fail } from "k6";
import { logError } from "./gpt_k6_modules.js";

// Group //

export function searchAndCreateGroup(groupName) {
  let rootGroupId = searchForGroup(__ENV.ENVIRONMENT_ROOT_GROUP);
  let groupId = searchForGroup(groupName);
  if (groupId) { deleteGroup(groupId) }

  let res = createGroup(groupName, rootGroupId);
  groupId = JSON.parse(res.body)['id'];
  /20(0|1)/.test(res.status) ? console.log(`Group #${groupId} was created`) : (logError(res), fail("Group was not created"));
  return groupId;
}

export function createGroup(groupName, rootGroupId) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata = {
    name: `${groupName}-${Date.now()}`,
    path: `${groupName}-${Date.now()}`,
    visibility: "public",
    parent_id: rootGroupId
  };
  let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/groups`, formdata, params);
  return res;
}

export function updateGroup(groupId, formData, tags) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  if (tags) { params['tags'] = tags; }
  let res = http.put(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${groupId}`, formData, params);
  return res;
}

export function deleteGroup(groupId) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.del(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${groupId}`, undefined, params);
  (res.status == "202") ? console.log(`Group #${groupId} was deleted`) : logError(res);
}

export function searchForGroup(groupName) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${groupName}`, params);
  let foundGroup = JSON.parse(res.body);
  let groupId = foundGroup && foundGroup.id;  
  groupId ? console.log(`Group contaning '${groupName}' name has id=${groupId}`) : console.log(`No groups containing name: '${groupName}'`);
  return groupId;
}

// Project //

export function createProject(groupId, additionalConfig={}) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata = {
    name: `project-api-v4-new-scenario`,
    namespace_id: groupId,
    auto_devops_enabled: false,
    visibility: "public",
    default_branch: "main",
    initialize_with_readme: true
  };
  let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects`, formdata, params);
  let projectId = JSON.parse(res.body)['id'];
  /20(0|1)/.test(res.status) ? console.log(`Project #${projectId} was created`) : (logError(res), fail("Project was not created"));

  if (Object.keys(additionalConfig).length !== 0) editProject(projectId, additionalConfig)

  return projectId;
}

export function updateProject(projectId, formData, tags) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  if (tags) { params['tags'] = tags; }
  let res = http.put(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}`, formData, params);
  return res;
}

// Bug workaround: Default branch is ignored when creating a project via API - https://gitlab.com/gitlab-org/gitlab/-/issues/26261
export function getProjectDefaultBranch(projectId) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}`, params);
  let project = JSON.parse(res.body);
  let defaultBranch = project && project.default_branch;  
  defaultBranch ? console.log(`Project with id=${projectId} has default_branch=${defaultBranch}`) : console.log(`Default branch can't be detected for the project '${projectId}'`);

  return defaultBranch;
}

export function editProject(projectId, config) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };

  let res = http.put(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}`, config, params);
  /20(0|1)/.test(res.status) ? console.log(`Project config changed to ${JSON.stringify(config)}`) : (logError(res), fail(`Error occured when attempting to edit Project settings to ${JSON.stringify(config)}.`));
}

// Source Code //

export function createBranch(projectId, ref, branchName) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` }, tags: { endpoint: 'branches' } };

  let createBranchRes = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${projectId}/repository/branches`, { branch: branchName, ref: ref }, params);
  return createBranchRes;
}
