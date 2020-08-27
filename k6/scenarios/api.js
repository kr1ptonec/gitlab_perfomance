/*global __ENV : true  */

export let apiScenario = {
  contacts: {
    executor: 'constant-arrival-rate',
    rate: 200,
    duration: '1m',
    preAllocatedVUs: 50,
    maxVUs: 200
  }
}