import http from "k6/http";

export function getStartupGraphqlCalls(url) {
  var graphqlQuery = null;
  let res = http.get(url);
  const doc = res.html();
  doc
    .find('script')
    .each(function (idx, el) {
      var script_html = el.innerHTML();
      if (script_html.includes('startup_graphql_calls')) {
        var start = script_html.indexOf('startup_graphql_calls') + 'startup_graphql_calls = ['.length;
        var end = script_html.indexOf('];\n\nif (gl.startup_calls', start);
        graphqlQuery = script_html.substring(start,end);
      }
    });

  if (graphqlQuery) {
    graphqlQuery = parseHtmlEntities(graphqlQuery);
    console.log(`Prepared GraphQL payload - '${graphqlQuery.substring(0, 50)}...'`);
  } else {
    console.log('GraphQL payload not found');
  }

  return graphqlQuery;
}

export function parseHtmlEntities(str) {
  return str.replace(/&#([0-9]{1,3});/gi, function(match, numStr) {
      var num = parseInt(numStr, 10);
      return String.fromCharCode(num);
  });
}
