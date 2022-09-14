/*global __ENV, __VU : true  */
import { fail } from "k6";

// ------------------------- Common --------------------------------------------

export function logError(res) {
  // Only log errors for the first 5 VUs to prevent spam
  if (__VU > 5) return;
  if ( typeof logError.last == 'undefined' ) logError.last = '';

  let error;
  try {
    let message = JSON.parse(res.body)['message'] || JSON.parse(res.body)['error']
    error = typeof message === 'object' ? JSON.stringify(message) : message
  } catch (e) {
    error = res.body
  }

  let correlationId = getObjectValue(res.headers,'X-Request-Id');
  let rateLimit = getObjectValue(res.headers, 'RateLimit-Name');

  // Report redirects when responseType is null
  if (/30(1|2)/.test(res.status) && error === null) error = "request was redirected"

  if (logError.last != error) {
    logError.last = error;
    let message = `Error detected: '${logError.last}'`;
    if (rateLimit) { message = `${message} ====> Rate Limit error caused by '${rateLimit}' limit.`; }
    if (correlationId) { message = `${message} ====> Correlation ID: ${correlationId}`; }
    console.warn(message);
  }
}

// Case insensitive value search in the object
// GitLab headers have different case sensitivity
// depending on target environment, examples: 'RateLimit-Name', 'Ratelimit-Name' and 'ratelimit-name'
function getObjectValue(object, key) {
  return object[Object.keys(object).find(k => k.toLowerCase() == key.toLowerCase())];
}

export function logGraphqlError(graphQLErrors) {
  // Only log errors for the first 5 VUs to prevent spam
  if (__VU > 5) return;
  console.log(JSON.stringify(graphQLErrors));
}

export function parseVersion(version) {
  let verRegex = /([0-9]+)/g;
  let parsedVersion = version.match(verRegex);

  return parsedVersion.map(ver => parseInt(ver))
}

export function envVersionIsHigherThan(version) {
  let envVersion = parseVersion(__ENV.ENVIRONMENT_VERSION);
  let targetVersion = parseVersion(version);

  return envVersion[0] > targetVersion[0] || (envVersion[0] == targetVersion[0] && envVersion[1] >= targetVersion[1]);
}

// ------------------------- Thresholds ----------------------------------------

/*
Thresholds structure:
{
  'rps': { 'gitlabVer1': 0.2, 'gitlabVer2': 0.7, 'latest': 0.8 },
  'ttfb': { 'gitlabVer1': 5000, 'gitlabVer2': 2000, 'latest': 1200 },
}
where 'gitlabVer' is the version where the test performance has changed due to application code changes.
'gitlabVer' should always be ordered by the version increase (ASC).
*/
export function getCurrentVersionThreshold(defaultThreshold, thresholds) {
  let threshold = null

  // Backward compatibility to support numbers or strings for threshold
  if ((Object.getOwnPropertyNames(thresholds).length === 0 ) || (typeof thresholds === 'string')) {
    threshold = isNaN(thresholds) ? defaultThreshold : thresholds;
  } else {
    for (var version in thresholds) {
      // Use historical threshold if threshold version is bigger than env version
      if ((version != 'latest') && (!envVersionIsHigherThan(version))) {
        threshold = thresholds[version];
        break;
      } else {
        threshold = thresholds['latest'] == null ? defaultThreshold : thresholds['latest'];
      }
    }
  }

  return threshold;
}

export function getRpsThresholds(rpsThresholds={}, endpoints=1) {
  let rpsModifier = getCurrentVersionThreshold(1, rpsThresholds);
  let buffer = __ENV.RPS_THRESHOLD_MULTIPLIER;
  let thresholds = {
    count: (parseFloat(__ENV.OPTION_RPS_COUNT) * rpsModifier * buffer).toFixed(0),
    mean: (parseFloat(__ENV.OPTION_RPS) * rpsModifier * buffer).toFixed(2),
    count_per_endpoint: ((parseFloat(__ENV.OPTION_RPS_COUNT) * rpsModifier * buffer) / endpoints).toFixed(0),
    mean_per_endpoint: ((parseFloat(__ENV.OPTION_RPS) * rpsModifier * buffer) / endpoints).toFixed(2)
  };
  return thresholds;
}

export function getTtfbThreshold(ttfbThresholds={}) {
  let ttfbThreshold = getCurrentVersionThreshold(__ENV.TTFB_THRESHOLD, ttfbThresholds);
  let latency = parseInt(__ENV.ENVIRONMENT_LATENCY) || 0;
  return parseInt(ttfbThreshold) + latency;
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

// ------------------------- Test Data -----------------------------------------

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

  // Prepare subgroups data
  group_with_projects['encoded_subgroups_path'] = [];
  group_with_projects['subgroups_path_web'] = [];
  for (let i = 1; i <= group_with_projects['subgroups_count']; i++) {
    group_with_projects['encoded_subgroups_path'].push(`${group_with_projects['encoded_group_path']}%2F${group_with_projects['subgroup_prefix']}${i}`);
    group_with_projects['subgroups_path_web'].push(`${group_with_projects['unencoded_group_path']}/${group_with_projects['subgroup_prefix']}${i}`);
  }

  if (!Object.prototype.hasOwnProperty.call(group_with_projects, key)) fail(`Missing Project Config Data: No options in Environment config were found with the following required data - ${key}. Update your Environment Config file to have all data for 'many_groups_and_projects' setting and rerun. Refer to docs for more info. Exiting...`);

  return group_with_projects[key];
}

//Returns secure project data
export function getSecureProjects() {
  let group_with_projects = JSON.parse(__ENV.ENVIRONMENT_SECURE_PROJECTS);
  console.log(`group_with_projects: ${JSON.stringify(group_with_projects)}`)
  // Prepare projects data
  group_with_projects['encoded_projects_path'] = [];
  group_with_projects['unencoded_projects_path'] = [];
  for (let i = 0; i < group_with_projects['projects_count']; i++) {
    group_with_projects['encoded_projects_path'].push(`${group_with_projects['encoded_group_path']}%2F${group_with_projects['project_prefix']}${i}`);
    group_with_projects['unencoded_projects_path'].push(`${group_with_projects['unencoded_group_path']}/${group_with_projects['project_prefix']}${i}`);
  }
  console.log(`computed_group_with_projects: ${JSON.stringify(group_with_projects)}`)
  return group_with_projects
}

export function selectRandom(entities) {
  return entities.length == 1 ? entities[0] : entities[entities.length * Math.random() << 0];
}
