/*global __ENV : true  */

// api
export let apiRps = parseInt(__ENV.ENVIRONMENT_RPS)
export let apiRpsThreshold = (apiRps * __ENV.RPS_THRESHOLD_MULTIPLIER).toFixed(2)
export let apiScenario = {
  api: {
    executor: 'constant-arrival-rate',
    rate: apiRps,
    duration: '1m',
    preAllocatedVUs: (apiRps * 0.25).toFixed(0),
    maxVUs: apiRps
  }
}

// web
export let webRps = (parseInt(__ENV.ENVIRONMENT_RPS) * 0.1).toFixed(0)
export let webRpsThreshold = (webRps * __ENV.RPS_THRESHOLD_MULTIPLIER).toFixed(2)
export let webScenario = {
  web: {
    executor: 'constant-arrival-rate',
    rate: webRps,
    duration: '1m',
    preAllocatedVUs: (webRps * 0.25).toFixed(0),
    maxVUs: webRps
  }
}

// git
export let gitRps = (parseInt(__ENV.ENVIRONMENT_RPS) * 0.1).toFixed(0)
export let gitRpsThreshold = (gitRps * __ENV.RPS_THRESHOLD_MULTIPLIER).toFixed(2)
export let gitScenario = {
  git: {
    executor: 'constant-arrival-rate',
    rate: gitRps,
    duration: '1m',
    preAllocatedVUs: (gitRps * 0.25).toFixed(0),
    maxVUs: gitRps
  }
}
