# GitLab Performance Toolkit - Running Load Performance Tests with `Artillery` **(Deprecated)**

### **:warning: This tool is now deprecated in favor of the [k6 tool](k6.md) and it will be removed in the future.**

**Note: Before running any tests with the Toolkit, the intended GitLab environment should be prepared first. Details on how to do this can be found here: [GitLab Performance Toolkit - Environment Preparation](environment_prep.md)**

## Toolkit Setup

On each machine you intend to use as a Artillery test runner you will need to setup the Toolkit:

1. First, set up [`Ruby`](https://www.ruby-lang.org/en/documentation/installation/), [`Ruby Bundler`](https://bundler.io) and [`NodeJS`](https://nodejs.org/en/download/package-manager/) if they aren't already available on the machine.
1. Next proceed to install / update the required tools by running the following commands at the root of this project:
    * `bundle install --path vendor/bundle && npm install`

## Test Configuration

Out of the box all tests have default values set for our automated test pipelines. If you are looking to run the tests against your own Environment(s), Test Project(s) or if you want to define new Scenario(s) this section aims to take you through all relevant areas of config and how to set them accordingly.

The Artillery tests have a few key areas of configuration - [Environments]((https://gitlab.com/gitlab-org/quality/performance/tree/master/artillery/environments) and [Scenarios](https://gitlab.com/gitlab-org/quality/performance/tree/master/artillery/scenarios). Both of these follow the [Artillery configuration file format](https://artillery.io/docs/script-reference/) and, as their names suggest, these files define config for Environment(s) / Test Project(s) to be tested and the Scenario(s) that are to be run against them. Our scripts ultimately combine each each to create a single config file for every Scenario to be run as detailed below in each section.

### Environments

The [Environment Config files](https://gitlab.com/gitlab-org/quality/performance/tree/master/artillery/environments) each define an Environment to be tested as well as any other relevant variables that should be applied in any Scenario.

It should be highlighted that Environment files are combined with each Scenario file, their respective config merged and then passed to Artillery for it to run through each. **Note that Environment files have precedence** and will override any of the same variables also defined in Scenario files.

For more details, the following expandable section contains an example of one of our actual Environment config files, [`10k.testbed.gitlab.net`](https://gitlab.com/gitlab-org/quality/performance/blob/master/artillery/environments/10k.testbed.gitlab.net.yml), with detailed explanations:

<p>
<details>
<summary>Environment Config File Example - <code>artillery/environments/10k.testbed.gitlab.net.yml</code></summary>

```yaml
config:
  target: http://10k.testbed.gitlab.net

  variables:
    PROJECT_GROUP: qa-perf-testing
    PROJECT_NAME: gitlabhq
    PROJECT_COMMIT_SHA: 0a99e022
    PROJECT_BRANCH: 10-0-stable
    PROJECT_FILE_PATH: qa%2Fqa%2Erb
    PROJECT_MR_COMMITS_IID: 10495
    PROJECT_MR_NOTES_IID: 6946
    PROJECT_SIGNED_COMMIT_SHA: 6526e91f

  phases:
    - duration: 5
      arrivalRate: 1
      rampTo: 2
      name: "Warm up"

    - duration: 15
      arrivalRate: 2
      rampTo: 20
      name: "Ramp Up"

    - duration: 45
      arrivalRate: 20
      name: "Full Load"
```

Going through this example section by section:
* `target` - The main URL for the Environment to be tested
* `variables.PROJECT_*` - Here we define several variables about the Environment's Test Project to be used by the Scenarios. Each are set here to defaults for the `gitlab-ce` project described earlier in the [Test Project Setup](#test-project-setup) section.
  * `PROJECT_GROUP` -  The name of the group that contains the intended project.
  * `PROJECT_NAME` - The name of intended project.
  * `PROJECT_COMMIT_SHA` - The SHA reference of a large commit available in the project. The size of the commit should be tuned to your environment's requirements.
  * `PROJECT_BRANCH` - The name of a large branch available in the project. The size of the branch should be tuned to your environment's requirements.
  * `PROJECT_FILE_PATH` - The relative path to a normal sized file in your project.
  * `PROJECT_MR_COMMITS_IID` - The [iid](https://docs.gitlab.com/ee/api/#id-vs-iid) of a merge request available in the project that has a large number of commits. The size of the MR should be tuned to your environment's requirements.
  * `PROJECT_MR_NOTES_IID` - The [iid](https://docs.gitlab.com/ee/api/#id-vs-iid) of a merge request available in the project that has a large number of notes / comments. The size of the MR notes should be tuned to your environment's requirements.
  * `PROJECT_SIGNED_COMMIT_SHA` - The SHA reference of a [signed commit](https://docs.gitlab.com/ee/user/project/repository/gpg_signed_commits/) available in the project.
* `phases.*` - This is an optional section for Environments that define the [Artillery Load Phases](https://artillery.io/docs/script-reference/#load-phases) to be used for performing tests. These are typically defined in Scenario files but can be overridden here if the particular environment requires.

In addition to the above, any [available config for Artillery](https://artillery.io/docs/script-reference/) can also be defined at this level that will in turn be defined for every scenario.

</details>
</p>

### Scenarios

The [Scenario Config files](https://gitlab.com/gitlab-org/quality/performance/tree/master/artillery/scenarios) each define a Scenario to be run against an intended Environment as well as any other relevant variables that should be applied in the Scenario.

As mentioned in the [Environments](#environments) section, each Scenario file is combined with Environment files, their respective config merged and then passed to Artillery for it to run through each. **Note that Environment files have precedence** and will override any variables also defined in Scenario files.

For more details, the following expandable section contains an example of one of our actual Scenario config files, [`api_v4_projects_project`](https://gitlab.com/gitlab-org/quality/performance/blob/master/artillery/scenarios/api_v4_projects_project.yml) (which tests the [Single Project API](https://docs.gitlab.com/ee/api/projects.html#get-single-project)), with detailed explanations:

<p>
<details>
<summary>Scenario Config File Example - <code>artillery/scenarios/api_v4_projects_project.yml</code></summary>

```yaml
config:
  defaults:
    headers:
      PRIVATE-TOKEN: "{{ $processEnvironment.ACCESS_TOKEN }}"
      Accept: "application/json"

  plugins:
    expect: {}

  phases:
    - duration: 2
      arrivalRate: 2
      rampTo: 20
      name: "Warm up"

    - duration: 10
      arrivalRate: 20
      name: "Load"

scenarios:
  - flow:
      - get:
          url: /api/v4/projects/{{PROJECT_GROUP}}%2F{{PROJECT_NAME}}
          expect:
            - statusCode: 200
```

Going through this example section by section:
* `defaults.headers.PRIVATE-TOKEN` - The [GitLab Personal Access Token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) (with `api` and `read_repository` permissions) to use for accessing the given URL on the intended Environment. This is only required for Scenarios that are to access URLs that require authentication. With our scripts we define this token as an environment variable, `ACCESS_TOKEN`, which is in turn pulled into the script.
* `defaults.headers.Accept` - Another optional Header variable that is set in Scenarios to be passed with URL requests as required.
* `plugins.expect` - This enables the [Artillery Expect plugin](https://github.com/artilleryio/artillery-plugin-expect) that checks responses.
* `phases.*` - While optional for Environment files, this section is expected to be defined here per Scenario. For more information refer to the relevant section in Artillery's config - [Artillery Load Phases](https://artillery.io/docs/script-reference/#load-phases).
* `scenarios.*` - The actual definition of the test scenarios. Like the phases config, refer to the relevant section in Artillery's config - [Artillery Scenarios](https://artillery.io/docs/script-reference/#scenarios) - for more information.

</details>
</p>

## Running Tests

Running the Artillery tests can be done with one of two convenience commands - [`artillery/run-environment`](https://gitlab.com/gitlab-org/quality/performance/blob/master/artillery/run-environment) and [`artillery/run-scenarios`](https://gitlab.com/gitlab-org/quality/performance/blob/master/artillery/run-scenarios).

The following is the help output for each command that details how to use them and what variables they accept:

<p>
<details>
<summary><code>artillery/run-environment</code></summary>

```bash
Usage: artillery/run-environment [environment-name]

Runs all available scenarios against the specified environment. Requires the specified environment config script to exist in artillery/environments.

Required Environment Variables:
  ACCESS_TOKEN - A valid GitLab Personal Access Token for the specified environment. The token should come from a User that has admin access for the project(s) to be tested and have API and read_repository permissions.

Optional Environment Variables:
  ARTILLERY_VERBOSE - Shows all output from Artillery when true. Warning: This output is very verbose. Default: false.
  QUARANTINED - Will include any tests inside the artillery/scenarios/quarantined folder when true. Default: false.

Example(s):
  bundle exec artillery/run-environment onprem.testbed.gitlab.net
```

</details>
</p>

<p>
<details>
<summary><code>artillery/run-scenarios</code></summary>

```bash
Usage: artillery/run-scenarios [environment-script] -- [scenario-script(s)]

Runs the specified scenario(s) against the given environment. Requires the specified scenario(s) and environment files to exist.

Required Environment Variables:
  ACCESS_TOKEN - A valid GitLab Personal Access Token for the specified environment. The token should come from a User that has admin access for the project(s) to be tested and have API and read_repository permissions.

Optional Environment Variables:
  ARTILLERY_VERBOSE - Shows all output from Artillery when true. Warning: This output is very verbose. Default: false.
  QUARANTINED - Will include any tests inside the artillery/scenarios/quarantined folder when true. Default: false.

Example(s):
  bundle exec artillery/run-scenarios artillery/environments/onprem.testbed.gitlab.net.yaml -- artillery/scenarios/api_v4_projects_merge_requests.yml
```

</details>
</p>

#### Artillery High RPS (Responses per Second) Tests

If the intention is to run the Artillery tests with a high RPS (e.g. 100 or 200 RPS) you may find Artillery will [warn about high CPU usage](https://artillery.io/docs/faq/#i-got-a-high-cpu-warning-from-artillery-what-does-that-mean). The Artillery docs linked describe some ways to work around this.

At the time of writing we utilize multiple runner machines to run Artillery tests in parallel. We've found a single instance works well at 20 RPS and then have scaled from here.