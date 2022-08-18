$LOAD_PATH.unshift File.expand_path('../lib', __dir__)
$stdout.sync = true

require "graphql/client"
require "graphql/client/http"
require 'gpt_logger'

# Overriding GraphQL::Client::HTTP headers method to pass GITLAB ACCESS_TOKEN
class CustomGraphqlHttp < GraphQL::Client::HTTP
  GITLAB_TOKEN = ENV['ACCESS_TOKEN']

  def headers(context)
    { 'PRIVATE-TOKEN' => GITLAB_TOKEN }
  end
end

# Create GraphQL client by loading schema and endpoint
class GQLClient
  def initialize(env_url)
    @endpoint = env_url
    @http = CustomGraphqlHttp.new(@endpoint)
    @schema = GraphQL::Client.load_schema(@http)
  end

  def client
    @client ||= GraphQL::Client.new(schema: @schema, execute: @http)
  end
end

class GQLQueries
  def initialize(env_url)
    @graphql_client = GQLClient.new(env_url).client

    @create_vulnerability_mutation_query = <<-'GRAPHQL'
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
  end

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
    # Using Constant for query as recommended here https://github.com/github/graphql-client#defining-queries

    begin
      # To avoid initializing constant multiple times during data generation
      Kernel.const_get(:CreateVulnerabilityMutation)
    rescue NameError => e
      GPTLogger.logger.warn "Constant was not initialized : #{e}; Initializing for the first time"
      Kernel.const_set(:CreateVulnerabilityMutation, @graphql_client.parse(@create_vulnerability_mutation_query))
    end
    result = @graphql_client.query(CreateVulnerabilityMutation, variables: { project_id: project_id_path,
                                                                             mutation_id: mutation_id,
                                                                             scanner_id: scanner_id,
                                                                             name: name,
                                                                             description: description,
                                                                             scanner_name: scanner_name,
                                                                             identifier: identifier,
                                                                             severity: severity })

    if result.data.nil?
      GPTLogger.logger.warn "Graphql query Error while creating vulnerability data: #{result.errors[:data]}"
    elsif !result.data.errors.messages.empty?
      GPTLogger.logger.warn "Graphql Server Error while creating vulnerability data: #{result.data.errors[:vulnerability_create]}"
    end

    result
  end
end
