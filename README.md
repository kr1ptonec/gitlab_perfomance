# GitLab Performance Tool

The GitLab Performance Tool (`gpt`) has been built by the GitLab Quality team to provide performance testing of any GitLab instance. The tool has been built upon the industry leading open source tool [k6](https://k6.io) and provides numerous tests that are designed to effectively performance test GitLab.

The tool can be used both manually and automatically, with us doing the latter for automated testing of reference environments via [Pipelines](https://gitlab.com/gitlab-org/quality/performance/pipeline_schedules).

## Documentation

Documentation on how to use the tool can be found in the [`docs/`](/docs/README.md) folder:

* [Environment Preparation](docs/environment_prep.md)
* [Running Tests](docs/k6.md)

# GitLab Test Results

The GitLab Quality team uses this Tool in frequent automated pipelines to continuously measure the performance of GitLab. The results are uploaded to this project's wiki and made available for anyone to see:

* Test runs against reference environments - https://gitlab.com/gitlab-org/quality/performance/wikis/Benchmarks/Latest
* Test runs comparing results of different GitLab versions - https://gitlab.com/gitlab-org/quality/performance/wikis/Benchmarks/GitLab-Versions
