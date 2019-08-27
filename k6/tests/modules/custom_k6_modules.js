/*global __ENV : true  */

export function logError(res) {
  if ( typeof logError.last == 'undefined' ) logError.last = '';

  let parsedError = JSON.parse(res.body)['message']
  if (logError.last != parsedError) {
    logError.last = parsedError;
    console.warn(`Error detected: '${logError.last}'`);
  }
}

export function getRpsThresholds(modifier=1.0) {
  let thresholds = {
    count: (parseFloat(__ENV.RPS_COUNT_THRESHOLD) * modifier).toFixed(0),
    mean: (parseFloat(__ENV.RPS_MEAN_THRESHOLD) * modifier).toFixed(2)
  }
  return thresholds;
}
