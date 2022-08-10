$LOAD_PATH.unshift File.expand_path('../lib', __dir__)
$stdout.sync = true

require "graphql/client"
require "graphql/client/http"
require 'gpt_logger'

# Initialize graphql client
module GPTGraphql
  # Configure GraphQL endpoint using the basic HTTP network adapter
  GITLAB_TOKEN = ENV.fetch('GITLAB_TOKEN')
  HTTP = GraphQL::Client::HTTP.new("https://gitlab.com/api/graphql") do
    def headers(context)
      { 'PRIVATE-TOKEN' => GITLAB_TOKEN }
    end
  end

  SCHEMA = GraphQL::Client.load_schema(HTTP)

  CLIENT = GraphQL::Client.new(schema: SCHEMA, execute: HTTP)
end

module GetVulnerabilities
  ProjectQuery = GPTGraphql::Client.parse <<-'GRAPHQL'
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
end

module CreateVulnerabilities
  Mutation = GPTGraphql::Client.parse <<-'GRAPHQL'
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

module MutationParameters
  def self.name
    SecureRandom.base64(6)
  end

  def self.description
    SecureRandom.base64(24)
  end

  def self.mutation_id
    SecureRandom.hex(6)
  end

  def self.scanner_id
    "gid://gitlab/Vulnerabilities::Scanner/#{rand(10000)}"
  end

  def self.scanner_name
    SecureRandom.hex(6)
  end

  def self.severity
    %i[CRITICAL LOW MEDIUM HIGH UNKNOWN INFO].sample
  end

  def self.identifier
    prefix = %w[CVE CWE].sample
    "#{prefix}-#{SecureRandom.hex(6)}"
  end
end

module CreateVulnerabilityData
  def self.create_vulnerability_data(project_id_path:)
    result = GPTGraphql::Client.query(CreateVulnerabilities::Mutation, variables: { project_id: project_id_path,
                                                                                    mutation_id: MutationParameters.mutation_id,
                                                                                    scanner_id: MutationParameters.scanner_id,
                                                                                    name: MutationParameters.name,
                                                                                    description: MutationParameters.description,
                                                                                    scanner_name: MutationParameters.scanner_name,
                                                                                    identifier: MutationParameters.identifier,
                                                                                    severity: MutationParameters.severity })

    GPTLogger.logger.warn "Graphql Error while creating vulnerability data: #{result.data.errors[:vulnerability_create]}" unless result.data.errors.messages.empty?
    result
  end
end
