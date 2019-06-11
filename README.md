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

### 2. Running artillery locally

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
