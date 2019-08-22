# GitLab Performance Toolkit - Running Web Performance Tests with `SiteSpeed`

The Toolkit can be used to test the web page rendering performance of any GitLab environment via the open source web rendering testing tool [SiteSpeed](https://www.sitespeed.io).

On this page​, we'll detail how to configure and run the tests.

**Note: Before running any tests with the Toolkit, the intended GitLab environment should be prepared first. Details on how to do this can be found here: [GitLab Performance Toolkit - Environment Preparation](environment_prep.md)**

## Test Configuration

For SiteSpeed tests all that is required is a text file list of URLs the tool should test for rendering performance. These can be found under the `sitespeed_urls` folder.

For more details, the following expandable section contains an example of one of our actual SiteSpeed URL list files, [`staging.txt`](https://gitlab.com/gitlab-org/quality/performance/blob/master/sitespeed_urls/staging.txt):

```
https://staging.gitlab.com/gitlab-com/infrastructure/issues/57
https://staging.gitlab.com/gitlab-com/operations/issues/42
https://staging.gitlab.com/gitlab-org/gitlab-ce/issues/22484
https://staging.gitlab.com/gitlab-org/gitlab-ce/issues/28717
https://staging.gitlab.com/gitlab-org/gitlab-ce/issues
https://staging.gitlab.com/gitlab-com/infrastructure/
https://staging.gitlab.com/gitlab-org/gitlab-ce
https://staging.gitlab.com/gitlab-org/gitlab-ee
https://staging.gitlab.com/gitlab-com/infrastructure/merge_requests
https://staging.gitlab.com/gitlab-org/gitlab-ce/merge_requests
https://staging.gitlab.com/gitlab-org/gitlab-ee/merge_requests
```

## Running Tests

The SiteSpeed tests are run via the official Docker image. 

Here is an example of the tests running against the OnPrem environment:
```bash
mkdir sitespeed-results
docker pull sitespeedio/sitespeed.io
docker run --shm-size=1g --rm -v "$(pwd)":/sitespeed.io sitespeedio/sitespeed.io --outputFolder sitespeed-results sitespeeds_url/onprem.txt
```

To run against a different environment you change the text file given at the end of command accordingly.

Results will be found on the host in the folder `sitespeed-results`, which will be located in the same directory as the one you used the command in.
