/*global __ENV : true  */

export function logError(res) {
  if ( typeof logError.last == 'undefined' ) logError.last = '';

  let error;
  try {
    error = JSON.parse(res.body)['message']
  } catch (e) {
    error = res.body
  }
  
  if (logError.last != error) {
    logError.last = error;
    console.warn(`Error detected: '${logError.last}'`);
  }
}

export function getRpsThresholds(modifier=1.0) {
  let buffer = 0.8
  let thresholds = {
    count: ((Math.ceil(parseFloat(__ENV.SCENARIO_RPS_COUNT) * modifier)) * buffer).toFixed(0),
    mean: ((Math.ceil(parseFloat(__ENV.SCENARIO_RPS) * modifier)) * buffer).toFixed(2)
  }
  return thresholds;
}

export function adjustRps(modifier=1.0) {
   return Math.ceil(parseFloat(__ENV.SCENARIO_RPS) * modifier);
}

export function adjustStageVUs(modifier=1.0) {
  let stages = JSON.parse(__ENV.SCENARIO_STAGES)
  stages.map((stage) => {
    stage.target = Math.ceil(stage.target * modifier);
    return stage
  });
  return stages;
}

export function selectProject(projects) {
  return projects.length == 1 ? projects[0] : projects[projects.length * Math.random() << 0];
}