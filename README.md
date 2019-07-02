# Performance Tests

Quality scheduled performance test pipelines

## Performance Test Bed

We have completed the epic for [setting up the testbed](https://gitlab.com/groups/gitlab-com/gl-infra/-/epics/60).

**TestBed**: https://onprem.testbed.gitlab.net/

## Usage

### 1. Installation

This repository requires that you have `Ruby Bundler` installed
and `NodeJS npm` installed.

```bash
bundle install --path vendor/bundle
npm install
```
### 2. Data for load tests

Currently, the data setup is manual and based on a combination of an import of https://github.com/gitlabhq/gitlabhq
project and using the [data generation script](https://gitlab.com/gitlab-org/gitlab-ce/blob/master/qa/qa/tools/generate_perf_testdata.rb).

The following environments are already setup with this data:
1. https://staging.gitlab.com
1. https://onprem.testbed.gitlab.net
1. https://pre.gitlab.com

#### Data setup

To setup data for load tests in a new environment, follow these steps:

1. Create a new `*.env` file under the `configs/` directory for your environment. You can use the contents of an existing `*.env` file such as `onprem_testbed.env` and modify them.
1. Create a public, top-level group in your environment. Add the name as `TEST_GROUP` in your `*.env` file.
Existing `*.env` files uses the name `qa-perf-testing`.
Use the ID of this group as the value for `GROUP_ID` in your `*.env` file.
1. [Import from GitHub](https://docs.gitlab.com/ee/user/project/import/github.html) the https://github.com/gitlabhq/gitlabhq project into your `TEST_GROUP`. 
Use the ID of this project as the value for `PROJECT_ID` in your `*.env` file.
1. Create a merge request with many commits using the [data generation script](https://gitlab.com/gitlab-org/gitlab-ce/blob/master/qa/qa/tools/generate_perf_testdata.rb).
From the `qa/` directory, this command: `PROJECT_NAME="gitlabhq" GROUP_NAME="<TEST_GROUP>" GITLAB_ADDRESS="<your_GitLab_instance_address>" GITLAB_QA_ACCESS_TOKEN="<your_access_token>" rake generate_perf_testdata["create_mr_with_many_commits"]`.    
Once the script succeeds, it will output a URL for the MR. 
Use the id from the URL as the value for `MR_IID_MANY_COMMITS` in your `*.env` file.
1. Create [a signed commit](https://docs.gitlab.com/ce/user/project/repository/gpg_signed_commits/). 
Use the commit SHA as the value for `SIGNED_COMMIT_SHA` in your `*.env` file. 

After the above steps, you will have values for `TEST_GROUP`, `GROUP_ID`, `PROJECT_ID`, `MR_IID_MANY_COMMITS` and `SIGNED_COMMIT_SHA`
environment variables in your `*.env` file. 

Other environment variables needed in `*.env` are: 
```
export HOST_URL=<host_url>
export BRANCH_NAME=10-0-stable
export COMMIT_SHA=0a99e022
export FILE_PATH=qa%2Fqa%2Erb
export FULL_LOAD_ARRIVAL_RATE=1
export FULL_LOAD_DURATION=10
export MR_IID=31
export RAMPUP_ARRIVAL_RATE=1
export RAMPUP_DURATION=10
export WARMUP_ARRIVAL_RATE=1
export WARMUP_DURATION=10
``` 

### 3. Running artillery locally

Load the suitable configuration from `configs/`
and run desired testing scenario from `scripts/`.

Example for testing `pre.gitlab.com`:

```bash
source configs/pre-prod.env
bundle exec scripts/artillery-api-single-scenario
```

## Testing scenarios

The following are the performance jobs that can be seen in this repository:

### 1. Gitlay N+1 Detector Tests

TBD

### 2. Load Testing

TBD

### 3. Functional Performance Tests

TBD

### 4. Integration with Prometheus

TBD

### 5. Integration with Sitespeed

TBD
