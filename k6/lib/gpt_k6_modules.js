/*global __ENV : true  */
import { fail } from "k6";

export function logError(res) {
  if ( typeof logError.last == 'undefined' ) logError.last = '';

  let error;
  try {
    let message = JSON.parse(res.body)['message'] || JSON.parse(res.body)['error']
    error = typeof message === 'object' ? JSON.stringify(message) : message
  } catch (e) {
    error = res.body
  }

  // Report redirects when responseType is null
  if (/30(1|2)/.test(res.status) && error === null) error = "request was redirected"

  if (logError.last != error) {
    logError.last = error;
    console.warn(`Error detected: '${logError.last}'`);
  }
}

export function checkProjectKeys(project, keys) {
  return keys.every(key => Object.prototype.hasOwnProperty.call(project, key));
}

// Returns projects that contain all keys (if passed) or exits if none found
export function getLargeProjects(keys=[]) {
  let large_projects = JSON.parse(__ENV.ENVIRONMENT_LARGE_PROJECTS);
  
  let projects_with_keys = {};
  if (Array.isArray(keys) && keys.length > 0) {
    projects_with_keys = large_projects.filter(project => checkProjectKeys(project, keys));
  }

  if (projects_with_keys.length == 0) fail(`Missing Project Config Data: No projects in Project config were found with the following required data - ${keys.join(', ')}. Update your Project Config file to have all data for the large project and rerun. Refer to docs for more info. Exiting...`);
  return projects_with_keys;
}

// Returns horizontal data object
export function getManyGroupsOrProjects(key) {
  let group_with_projects = JSON.parse(__ENV.ENVIRONMENT_MANY_GROUPS_AND_PROJECTS);

  if (!Object.prototype.hasOwnProperty.call(group_with_projects, key)) fail(`Missing Project Config Data: No options in Environment config were found with the following required data - ${key}. Update your Environment Config file to have all data for 'many_groups_and_projects' setting and rerun. Refer to docs for more info. Exiting...`);

  return group_with_projects[key];
}

export function selectRandom(entities) {
  return entities.length == 1 ? entities[0] : entities[entities.length * Math.random() << 0];
}
