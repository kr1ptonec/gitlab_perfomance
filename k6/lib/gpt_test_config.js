/*global __ENV : true  */

export function getRps(endpointType) {
  let rps;
  if (__ENV.OPTIONS_RPS) {
    rps = parseInt(__ENV.OPTIONS_RPS);
  } else if (__ENV.ENVIRONMENT_RPS) {
    rps = parseInt(__ENV.ENVIRONMENT_RPS);
  } else {
    rps = 2
  }

  if (endpointType === 'web' || endpointType === 'git') rps *= 0.1;

  return rps.toFixed(0);
}

export function getDuration() {
  let duration;
  if (__ENV.OPTIONS_DURATION) {
    duration = __ENV.OPTIONS_DURATION;
  } else if (__ENV.ENVIRONMENT_DURATION) {
    duration = __ENV.ENVIRONMENT_DURATION;
  } else {
    duration = '60s'
  }

  return duration;
}

export function getRpsThreshold(endpointType, modifier=1.0) {
  let buffer = __ENV.RPS_THRESHOLD_MULTIPLIER
  let rps = getRps(endpointType)

  return (rps * modifier * buffer).toFixed(2);
}

export function getTtfbThreshold(ttfbBase=__ENV.TTFB_THRESHOLD) {
  let latency = parseInt(__ENV.ENVIRONMENT_LATENCY) || 0;
  return parseInt(ttfbBase) + latency;
}

export function getScenario(endpointType) {
  let rps = getRps(endpointType);
  let duration = getDuration();

  let scenario = {};
  scenario[endpointType] = {
    executor: 'constant-arrival-rate',
    rate: rps,
    duration: duration,
    preAllocatedVUs: (rps * 0.25).toFixed(0),
    maxVUs: rps
  }

  return scenario;
}
