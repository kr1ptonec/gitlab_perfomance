## What does this MR do?

<!-- Briefly describe what this MR is about. -->

## Related issues

<!-- Mention the GPT issue this MR is related to -->

## Checklist

- [ ] Ensure test data for the new endpoint is representative. We recommend using large data ("edge cases") in performance tests. The impact of optimizations is more visible on the big numbers and large data may expose more performance bottlenecks.
- [ ] Fill in `@endpoint` and `@description` tags with the information regarding the new test.
- [ ] Create a bug if the endpoint response time is above the [`performance main target (500 ms)`](https://about.gitlab.com/handbook/engineering/quality/issue-triage/#severity).
  - Specify created issue link under `@issue` tag.
- [ ] Consider specifying the additional `@flags`:  
  - `unsafe` - required for [Unsafe tests](https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/k6.md#unsafe-tests). Ensure that data before and after the test is consistent.
  - `search` - labels Search related tests.
  - `dash_url` - labels Web tests with the check if the endpoint path has a dash \ redirect.
- [ ] [Web tests](https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/k6.md#test-types)
  - Specify all called controller methods under the `@description`.
  - Consider creating MR to add the new test to [GitLab Performance SiteSpeed](https://gitlab.com/gitlab-org/quality/performance-sitespeed).

/label ~Quality ~performance ~"Quality:performance"
