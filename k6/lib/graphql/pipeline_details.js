export const operationName = 'getPipelineDetails'

export function variables(unencoded_path, pipelineIid) {
  return encodeURI(`{ "projectPath": "${unencoded_path}", "iid": "${pipelineIid}" }`);
}

export const pipelineDetailsQuery = encodeURI(`fragment LinkedPipelineData on Pipeline { __typename id iid path status: detailedStatus { __typename id group label icon } sourceJob { __typename id name } project { __typename id name fullPath } } query getPipelineDetails($projectPath: ID!, $iid: ID!) { project(fullPath: $projectPath) { __typename id pipeline(iid: $iid) { __typename id iid complete usesNeeds userPermissions { updatePipeline __typename } downstream { __typename nodes { ...LinkedPipelineData __typename } } upstream { ...LinkedPipelineData __typename } stages { __typename nodes { __typename id name status: detailedStatus { __typename id action { __typename id icon path title } } groups { __typename nodes { __typename id status: detailedStatus { __typename id label group icon } name size jobs { __typename nodes { __typename id name scheduledAt needs { __typename nodes { __typename id name } } status: detailedStatus { __typename id icon tooltip hasDetails detailsPath group action { __typename id buttonTitle icon path title } } } } } } } } } } }`);
