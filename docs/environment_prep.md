# GitLab Performance Tool - Preparing the Environment

* [**GitLab Performance Tool - Preparing the Environment**](environment_prep.md)
* [GitLab Performance Tool - Running Tests](k6.md)

Before running any of the tests they require that the GitLab environment is prepared. This involves seeding the environment with one or more representative [Projects](https://docs.gitlab.com/ee/user/project/) along with setting up an [Access Token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) for authentication.

* [Test Project(s) Setup](#test-projects-setup)
  * [Importing via UI](#importing-via-ui)
  * [Importing via the `import-project` script](#importing-via-the-import-project-script)
  * [Importing via GitHub](#importing-via-github)
* [Advanced Setup](#advanced-setup)
  * [One or more Gitaly nodes](#one-or-more-gitaly-nodes)
* [Troubleshooting](#troubleshooting)
  * [Gitaly calls error when importing](#gitaly-calls-error-when-importing)
* [Access Token Setup](#access-token-setup)

## Test Project(s) Setup

The tests require that there's representative data in the environment. This is done with one or more [Projects](https://docs.gitlab.com/ee/user/project/) that would be representative of typically larger projects that the environment is expected to contain.

At GitLab, the default setup for the tests is importing our own [GitLab FOSS](https://gitlab.com/gitlab-org/gitlab-foss/) project (named `gitlabhq` in this case) under a group named `qa-perf-testing`. Project tarballs that we use for performance testing can be found over on the [performance-data](https://gitlab.com/gitlab-org/quality/performance-data) project. A different project can be used if required but will need to be configured accordingly for the tool to use it as per the [k6 Test Configuration section](./k6.md#configuring-the-tool).

There's several options for importing the project into your GitLab environment. They are detailed as follows with the assumption that the recommended group `qa-perf-testing` and project `gitlabhq` are being set up:

### Importing via UI

The first option is to simply [import the Project tarball file via the GitLab UI](https://docs.gitlab.com/ee/user/project/settings/import_export.html#importing-the-project):

1. Create the [Group](https://docs.gitlab.com/ee/user/group/#create-a-new-group) `qa-perf-testing`
2. Import the [GitLab FOSS Project Tarball](https://gitlab.com/gitlab-org/quality/performance-data/raw/master/gitlabhq_export.tar.gz) into the Group.

It should take up to 15 minutes for the project to import fully. You can head to the project's main page for the current status.

### Importing via the `import-project` script

A convenience script, [`bin/import-project`](https://gitlab.com/gitlab-org/quality/performance/blob/master/bin/import-project), is provided with this project to import a project tarball into a GitLab environment from the terminal.

Note that to use the script, it will require some preparation if you haven't done so already:
1. First, set up [`Ruby`](https://www.ruby-lang.org/en/documentation/installation/) and [`Ruby Bundler`](https://bundler.io) if they aren't already available on the machine.
1. Next, install the required Ruby Gems via Bundler
    * `bundle install`

The following is the help output for the command that details how to use it with examples:

```
Usage: import-project [options]

Imports a GitLab Project tarball (local or remote) into the specified environment.
Defaults to importing the gitlabhq project from a remote filestore to the specified environment, group and project namespace.

Options:
  --environment-url=<s>    Full URL for the environment to import to.
  --project-tarball=<s>    Location of project tarball to import. Can be local or remote. (Default:
                           https://gitlab.com/gitlab-org/quality/performance-data/raw/master/gitlabhq_export.tar.gz)
  --namespace=<s>          The ID or path of the namespace that the project will be imported to, such as a Group.
  --project-name=<s>       Name for project. Can be also be a combined path and name if required.
  --storage-name=<s>       Name for target repository storage (Gitaly). (Default: default)
  -h, --help               Show help message

Environment Variables:
  ACCESS_TOKEN             A valid GitLab Personal Access Token for the specified environment. The token should have admin access for the ability to import projects. (Default: nil)

Examples:
  import-project --environment-url 10k.testbed.gitlab.net
  import-project --environment-url localhost:3000 --project-tarball /home/user/test-project.tar.gz --namespace test-group --project-name test-project
```

The process should take up to 15 minutes for the project to import fully. The script will keep checking periodically for the status and exit once import has completed.

### Importing via GitHub

The last option is to [import the Project via the GitHub](https://docs.gitlab.com/ee/user/project/import/github.html):

1. Create the [Group](https://docs.gitlab.com/ee/user/group/#create-a-new-group) `qa-perf-testing`
2. Import the [GitLab FOSS backup on GitHub](https://github.com/gitlabhq/gitlabhq) into the Group via the UI.

This method will take longer to import than the other methods and will depend on several factors. It's recommended to use the other methods.

## Advanced Setup

This section covers more advanced setups depending on the environment being targeted.

### One or more Gitaly nodes

[Gitaly](https://docs.gitlab.com/ee/administration/gitaly/) is the component in GitLab that stores and handles Git repositories. On larger environments it's typical to have several of these nodes where each one at this time stores unique data. As such, to realistically test a GitLab environment with more than one Gitaly node projects should be imported onto each one and then provided to the tests accordingly so they can poll each one.

For convenience we test this by importing the same project (`gitlabhq`) once for each Gitaly node. The best way to do this currently is via the UI as follows:

1. Find out the names of each [storage path](https://docs.gitlab.com/ee/administration/repository_storage_paths.html) for your environment and what Gitaly nodes they are stored on
1. Set the target storage path as detailed in the [`Repository storage paths` documentation](https://docs.gitlab.com/ee/administration/repository_storage_paths.html#choose-where-new-project-repositories-will-be-stored) so the specific Gitaly node itself is targeted.
1. Upload the project as normal through [Importing via UI](#importing-via-ui)
1. After this has been completed for every Gitaly node as required change the [`Repository storage paths`](https://docs.gitlab.com/ee/administration/repository_storage_paths.html#choose-where-new-project-repositories-will-be-stored) settings back to all storage paths.

## Troubleshooting

In this section we'll detail any known issues we've seen when trying to import a project and how to manage them.

### Gitaly calls error when importing

If you're attempting to import a large project into a development environment you may see Gitaly throw an error about too many calls or invocations, for example:

```
Error importing repository into qa-perf-testing/gitlabhq - GitalyClient#call called 31 times from single request. Potential n+1?
```

This is due to a [n+1 calls limit being set for development setups](https://docs.gitlab.com/ee/development/gitaly.html#toomanyinvocationserror-errors). You can work around this by setting `GITALY_DISABLE_REQUEST_LIMITS=1` as an environment variable, restarting your development environment and importing again.

## Access Token Setup

Many of the tests also require a GitLab Personal Access Token. This is due to numerous endpoints themselves requiring authentication.

[The official GitLab docs detail how to create this token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#creating-a-personal-access-token). The tests require that the token is generated by an admin user and that it has the `API`, `read_repository`, and `write_repository` permissions.

Details on how to use the Access Token with each type of test are found in their respective documentation.
