/*global __ENV : true  */
import http from "k6/http";
import { fail } from "k6";
import { logError } from "./gpt_k6_modules.js";

export function createGroup(groupName) {
  let groupId = searchForGroup(groupName);
  if (groupId) { deleteGroup(groupId) }

  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata = {
    name: `${groupName}-${Date.now()}`,
    path: `${groupName}-${Date.now()}`,
    visibility: "public"
  };
  let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/groups`, formdata, params);
  groupId = JSON.parse(res.body)['id'];
  /20(0|1)/.test(res.status) ? console.log(`Group #${groupId} was created`) : (logError(res), fail("Group was not created"));
  return groupId;
}

export function createProject(groupId) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata = {
    name: `project-api-v4-new-scenario`,
    namespace_id: groupId,
    visibility: "public"
  };
  let res = http.post(`${__ENV.ENVIRONMENT_URL}/api/v4/projects`, formdata, params);
  let projectId = JSON.parse(res.body)['id'];
  /20(0|1)/.test(res.status) ? console.log(`Project #${projectId} was created`) : (logError(res), fail("Project was not created"));
  return projectId;
}

export function deleteGroup(groupId) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.del(`${__ENV.ENVIRONMENT_URL}/api/v4/groups/${groupId}`, undefined, params);
  (res.status == "202") ? console.log(`Group #${groupId} was deleted`) : logError(res);
}

export function searchForGroup(groupName) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/groups?search=${groupName}`, params);
  let foundGroup = JSON.parse(res.body)[0];
  let groupId = foundGroup && foundGroup.id;  
  groupId ? console.log(`Group contaning '${groupName}' name already exists with id=${groupId}`) : console.log(`No groups containing name: '${groupName}'`);
  return groupId;
}
