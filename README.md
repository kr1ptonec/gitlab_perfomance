# GitLab Performance Test Framework

Framework for testing the performance of any GitLab instance by utilizing [Artillery](https://artillery.io) and [SiteSpeed](https://www.sitespeed.io).

Provides for both manual and automatically scheduled testing of GitLab reference environments via [Pipelines](https://gitlab.com/gitlab-org/quality/performance/pipeline_schedules). 

## Usage

### Installation

This repository requires that you have `Ruby Bundler` installed
and `NodeJS npm` installed.

```bash
bundle install --path vendor/bundle
npm install
```

### Data for load tests

Currently, the data setup is semi-manual and involves importing the `gitlab-ce` backup from [GitHub](https://github.com/gitlabhq/gitlabhq).

This unfortunately can take quite long but Quality are looking at improving this.

#### Data setup

To setup data for load tests in a new environment, follow these steps:

1. Create a public, top-level group in your environment. Typically we use `qa-perf-testing`.
1. [Import from GitHub](https://docs.gitlab.com/ee/user/project/import/github.html) the https://github.com/gitlabhq/gitlabhq project into your `TEST_GROUP`. 
1. Copy one of the existing [environment files](https://gitlab.com/gitlab-org/quality/performance/tree/master/artillery/environments) and adjust accordingly for your intended environment. GitLab specific parameters should work with their defaults if above steps have been followed.

### Running Tests

#### Artillery

Running the Artillery tests can be done with one of two convenience commands - `artillery/run-environment` and `artillery/run-scenarios`:

**`artillery/run-scenarios`**

```bash
Usage: artillery/run-scenarios [environment-script] -- [scenario-script(s)]

Runs the specified scenario(s) against the given environment. Requires the specified scenario(s) and environment files to exist.

Optional Environment Variables:
  ARTILLERY_VERBOSE - Shows all output from Artillery when true. Warning: This output is very verbose. Default: false.
  QUARANTINED - Will include any tests inside the artillery/scenarios/quarantined folder when true. Default: false.

Example(s):
  bundle exec artillery/run-scenarios artillery/environments/onprem.testbed.gitlab.net.yaml -- artillery/scenarios/api_v4_projects_merge_requests.yml
```

Effectively the main driver of Artillery tests. This will run any given scenarios against a given environment. 

**`artillery/run-environment`**

```bash
Usage: artillery/run-environment [environment-name]

Runs all available scenarios against the specified environment. Requires the specified environment config script to exist in artillery/environments.

Optional Environment Variables:
  ARTILLERY_VERBOSE - Shows all output from Artillery when true. Warning: This output is very verbose. Default: false.
  QUARANTINED - Will include any tests inside the artillery/scenarios/quarantined folder when true. Default: false.

Example(s):
  bundle exec artillery/run-environment onprem.testbed.gitlab.net
```

#### SiteSpeed

The SiteSpeed tests can be run via the official Docker image. 

Here is an example of the tests running against the `onprem`:
```bash
mkdir sitespeed-results
docker pull sitespeedio/sitespeed.io
docker run --shm-size=1g --rm -v "$(pwd)":/sitespeed.io sitespeedio/sitespeed.io --outputFolder sitespeed-results sitespeeds_url/onprem.txt
```

To run against a different environment you change text file given at the end accordingly.

Results will be found in the host working directory in the folder `sitespeed-results`

#### N+1

TBC

## Further Reading

### Wiki

This project's [Wiki](https://gitlab.com/gitlab-org/quality/performance/wikis/home) will contain further reading, such as notable test results or benchmarks.