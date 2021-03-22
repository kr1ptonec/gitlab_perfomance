# GitLab Performance Tool

The GitLab Performance Tool (`gpt`) is built and maintained by the GitLab Quality Enablement team to provide performance testing of any GitLab instance. The tool has been built upon the industry leading open source tool [k6](https://k6.io) and provides numerous tests that are designed to effectively performance test GitLab.

The tool can be used both manually and automatically, with us doing the latter for automated testing of reference environments via [Pipelines](https://gitlab.com/gitlab-org/quality/performance/pipeline_schedules).

GPT is used by the GitLab Quality Enablement team to continuously performance test GitLab on environments based on our [Reference Architectures](https://docs.gitlab.com/ee/administration/reference_architectures/) that have been built with the [GitLab Environment Toolkit](https://gitlab.com/gitlab-org/quality/gitlab-environment-toolkit). For more information please refer to our blog post - [How our QA team leverages GitLab’s performance testing tool (and you can too)](https://about.gitlab.com/blog/2020/02/18/how-were-building-up-performance-testing-of-gitlab/).

## Documentation

Documentation on how to use the tool can be found in the [`docs/`](/docs/README.md) folder:

* [Preparing the Environment](docs/environment_prep.md)
* [Running the Tests](docs/k6.md)

**Note:** These docs are for GPT `v2`. For GPT `v1` please refer to the docs [here](https://gitlab.com/gitlab-org/quality/performance/-/blob/v1-master/README.md).

## GitLab Test Results

The GitLab Quality team uses this Tool in frequent automated pipelines to continuously measure the performance of GitLab. The results are uploaded to this project's wiki and made available for anyone to see:

* Test runs against reference environments - https://gitlab.com/gitlab-org/quality/performance/wikis/Benchmarks/Latest
* Test runs comparing results of different GitLab versions - https://gitlab.com/gitlab-org/quality/performance/wikis/Benchmarks/GitLab-Versions
