$LOAD_PATH.unshift File.expand_path('../lib', __dir__)
$stdout.sync = true

require "graphql/client"
require "graphql/client/http"
require 'gpt_logger'

# Overriding GraphQL::Client::HTTP headers method to pass GITLAB ACCESS_TOKEN
class CustomGraphqlHttp < GraphQL::Client::HTTP
  GITLAB_TOKEN = ENV.fetch('ACCESS_TOKEN')

  def headers(context)
    { 'PRIVATE-TOKEN' => GITLAB_TOKEN }
  end
end

# Create GraphQL client by loading schema and endpoint
class GQLClient
  def initialize
    @endpoint = ENV['GPT_GRAPHQL_ENDPOINT'] || "https://gitlab.com/api/graphql"
    @http = CustomGraphqlHttp.new(@endpoint)
    @schema = GraphQL::Client.load_schema(@http)
  end

  def client
    @client ||= GraphQL::Client.new(schema: @schema, execute: @http)
  end
end

class GQLQueries
  # Using Constants for graphql client as recommended here https://github.com/github/graphql-client#defining-queries
  GQL_CLIENT = GQLClient.new.client
  GET_QUERY = GQL_CLIENT.parse <<-'GRAPHQL'
     query(
        $path: ID!
         )
        {
          project(fullPath: $path)
          {
            vulnerabilities(severity: LOW){
              nodes{
                id
                resolvedOnDefaultBranch
                state
              }
            }
          }
        }
  GRAPHQL

  CREATE_VULNERABILITY_MUTATION = GQL_CLIENT.parse <<-'GRAPHQL'
     mutation(
            $project_id: ProjectID!,
            $name: String!,
            $mutation_id: String!,
            $description: String!,
            $scanner_name: String!,
            $identifier: String!,
            $scanner_id: String!,
            $severity: VulnerabilitySeverity
            )
 			     {
      	      vulnerabilityCreate(input:{
                  project: $project_id,
                  clientMutationId: $mutation_id,
                  name: $name,
                  description: $description,
                  scanner:{
                    name: $scanner_name,
                    id: $scanner_id,
                    url: "http://localhost/jk",
                    version: "1.1"
                  },
                  identifiers: {
                    name: $identifier,
                    url: "http://localhost"
                  },
                  severity: $severity
                  }
                  )
                  {
                    errors
                    clientMutationId
                    vulnerability: vulnerability {
                      id
                      vulnerabilityPath
                      project {
                        id
                        fullPath
                      }
                    }
                  }
               }
  GRAPHQL

  # Defining randomized parameters for vulnerability mutation
  def name
    SecureRandom.base64(6)
  end

  def description
    SecureRandom.base64(24)
  end

  def mutation_id
    SecureRandom.hex(6)
  end

  def scanner_id
    "gid://gitlab/Vulnerabilities::Scanner/#{rand(10000)}"
  end

  def scanner_name
    SecureRandom.hex(6)
  end

  def severity
    %i[CRITICAL LOW MEDIUM HIGH UNKNOWN INFO].sample
  end

  def identifier
    prefix = %w[CVE CWE].sample
    "#{prefix}-#{SecureRandom.hex(6)}"
  end

  def create_vulnerability_data(project_id_path)
    result = GQL_CLIENT.query(CREATE_VULNERABILITY_MUTATION, variables: { project_id: project_id_path,
                                                                          mutation_id: mutation_id,
                                                                          scanner_id: scanner_id,
                                                                          name: name,
                                                                          description: description,
                                                                          scanner_name: scanner_name,
                                                                          identifier: identifier,
                                                                          severity: severity })

    if result.data.nil?
      GPTLogger.logger.warn "Graphql query Error while creating vulnerability data: #{result.errors[:data]}"
    elsif result.data.errors.messages
      GPTLogger.logger.warn "Graphql Server Error while creating vulnerability data: #{result.data.errors[:vulnerability_create]}"
    end

    result
  end
end
