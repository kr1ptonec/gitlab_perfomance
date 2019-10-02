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
    count: ((Math.ceil(parseFloat(__ENV.RPS_COUNT_TARGET) * modifier)) * buffer).toFixed(0),
    mean: ((Math.ceil(parseFloat(__ENV.RPS_MEAN_TARGET) * modifier)) * buffer).toFixed(2)
  }
  return thresholds;
}
