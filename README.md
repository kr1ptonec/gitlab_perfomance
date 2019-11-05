# GitLab Performance Toolkit

The GitLab Performance Toolkit (`gpt`) provides several tools that enables you to performance test any GitLab instance. The toolkit is built with several standard tools that cover different areas of performance:

* Load Performance - [k6](https://k6.io)
* Web Rendering Performance - [SiteSpeed](https://www.sitespeed.io)

This project also performs automated testing for GitLab with the toolkit via [Pipelines](https://gitlab.com/gitlab-org/quality/performance/pipeline_schedules).

## Documentation

Documentation on how to use the toolkit can be found in the [`docs/`](/docs/README.md) folder:

* [Environment Preparation](docs/environment_prep.md)
* [Running Load Performance Tests with `k6`](docs/k6.md)
* [Running Web Performance Tests with `SiteSpeed`](docs/sitespeed.md)

## Further Reading

### Wiki

This project's [Wiki](https://gitlab.com/gitlab-org/quality/performance/wikis/home) contains further reading, such as notable test results or benchmarks.
