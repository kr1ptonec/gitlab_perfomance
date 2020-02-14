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
  
  if (logError.last != error) {
    logError.last = error;
    console.warn(`Error detected: '${logError.last}'`);
  }
}

export function getRpsThresholds(modifier=1.0, endpoints=1) {
  let buffer = __ENV.RPS_THRESHOLD_MULTIPLIER
  let thresholds = {
    count: (Math.ceil((parseFloat(__ENV.OPTION_RPS_COUNT) * modifier).toFixed(2)) * buffer).toFixed(0),
    mean: (Math.ceil((parseFloat(__ENV.OPTION_RPS) * modifier).toFixed(2)) * buffer).toFixed(2),
    count_per_endpoint: (Math.ceil((parseFloat(__ENV.OPTION_RPS_COUNT) * modifier).toFixed(2)) * buffer / endpoints).toFixed(0),
    mean_per_endpoint: (Math.ceil((parseFloat(__ENV.OPTION_RPS) * modifier).toFixed(2)) * buffer / endpoints).toFixed(2)
  }
  return thresholds;
}

export function getTtfbThreshold(ttfbBase=__ENV.TTFB_THRESHOLD) {
  return parseInt(ttfbBase) + parseInt(__ENV.TTFB_LATENCY);
}

export function adjustRps(modifier=1.0) {
   return Math.ceil(parseFloat(__ENV.OPTION_RPS) * modifier);
}

export function adjustStageVUs(modifier=1.0) {
  let stages = JSON.parse(__ENV.OPTION_STAGES)
  stages.map((stage) => {
    stage.target = Math.ceil(stage.target * modifier);
    return stage
  });
  return stages;
}

// Returns projects that contain all keys (if passed) or exits if none found
export function getProjects(keys=[]) {
  let projects = JSON.parse(__ENV.ENVIRONMENT_PROJECTS);
  let check_project_key = (project, keys) => keys.every(key => Object.prototype.hasOwnProperty.call(project, key));

  let projects_with_keys = {};
  if (Array.isArray(keys) && keys.length > 0) {
    projects_with_keys = projects.filter(project => check_project_key(project, keys));
  }

  if (projects_with_keys.length == 0) fail('No projects found with required keys for test. Exiting...');
  return projects_with_keys
}

export function selectProject(projects) {
  return projects.length == 1 ? projects[0] : projects[projects.length * Math.random() << 0];
}
