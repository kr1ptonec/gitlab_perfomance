export const pipelineDetailsQuery = `
  fragment LinkedPipelineData on Pipeline {
    __typename
    id
    iid
    path
    status: detailedStatus {
      __typename
      group
      label
      icon
    }
    sourceJob {
      __typename
      name
    }
    project {
      __typename
      name
      fullPath
    }
  }

  query getPipelineDetails($projectPath: ID!, $iid: ID!) {
    project(fullPath: $projectPath) {
      __typename
      pipeline(iid: $iid) {
        __typename
        id
        iid
        complete
        usesNeeds
        userPermissions {
          updatePipeline
        }
        downstream {
          __typename
          nodes {
            ...LinkedPipelineData
          }
        }
        upstream {
          ...LinkedPipelineData
        }
        stages {
          __typename
          nodes {
            __typename
            name
            status: detailedStatus {
              __typename
              action {
                __typename
                icon
                path
                title
              }
            }
            groups {
              __typename
              nodes {
                __typename
                status: detailedStatus {
                  __typename
                  label
                  group
                  icon
                }
                name
                size
                jobs {
                  __typename
                  nodes {
                    __typename
                    name
                    scheduledAt
                    needs {
                      __typename
                      nodes {
                        __typename
                        name
                      }
                    }
                    status: detailedStatus {
                      __typename
                      icon
                      tooltip
                      hasDetails
                      detailsPath
                      group
                      action {
                        __typename
                        buttonTitle
                        icon
                        path
                        title
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;
