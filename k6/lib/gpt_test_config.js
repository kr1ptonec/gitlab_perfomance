/*global __ENV : true  */

export function getRps(endpointType) {
  let rps = __ENV.OPTIONS_RPS ? parseInt(__ENV.OPTIONS_RPS) : parseInt(__ENV.ENVIRONMENT_RPS);

  switch(endpointType) {
    case 'web':
    case 'git':
      rps *= 0.1;
      break;
    case 'scenario':
      rps *= 0.01;
      break;
  }

  return Math.ceil(rps);
}

export function getDuration() {
  let duration = __ENV.OPTIONS_DURATION ? __ENV.OPTIONS_DURATION : __ENV.ENVIRONMENT_DURATION;

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
