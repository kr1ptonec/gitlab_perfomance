export function logError(res) {
  if ( typeof logError.last == 'undefined' ) logError.last = '';

  if (logError.last != res.body) {
    logError.last = res.body;
    console.warn(`Error detected: '${logError.last}'`);
  }
}
