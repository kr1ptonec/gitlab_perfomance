# GitLab Performance Toolkit - Environment Preparation

Before running any of the tests they require that the GitLab environment is prepared. This involves seeding the environment with a representative [Project](https://docs.gitlab.com/ee/user/project/) along with setting up an [Access Token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html) for authentication.

* [Test Project Setup](#test-project-setup)
  * [Importing via UI](#importing-via-ui)
  * [Importing via the `import-project` script](#importing-via-the-import-project-script)
  * [Importing via GitHub](#importing-via-github)
* [Troubleshooting](#troubleshooting)
  * [Gitaly calls error when importing](#gitaly-calls-error-when-importing)
* [Access Token Setup](#access-token-setup)

## Test Project Setup

The tests require that there's representative data in the environment. This is done with a [Project](https://docs.gitlab.com/ee/user/project/) that would be representative of a large project in the environment. 

At GitLab, the default setup for the tests is importing our own [GitLab CE](https://gitlab.com/gitlab-org/gitlab-ce/) project (named `gitlabhq` in this case) under a group named `qa-perf-testing`. Project tarballs that we use for performance testing can be found over on the [performance-data](https://gitlab.com/gitlab-org/quality/performance-data) project. A different project could be used if required but doing so will require adapting the tests accordingly as detailed on the test config page. 

There's several options for importing the project into your GitLab environment. They are detailed as follows with the assumption that the recommended group `qa-perf-testing` and project `gitlabhq` are being set up:

### Importing via UI

The first option is to simply [import the Project tarball file via the GitLab UI](https://docs.gitlab.com/ee/user/project/settings/import_export.html#importing-the-project):

1. Create the [Group](https://docs.gitlab.com/ee/user/group/#create-a-new-group) `qa-perf-testing`
2. Import the [GitLab CE Project Tarball](https://gitlab.com/gitlab-org/quality/performance-data/raw/master/gitlabhq_export.tar.gz) into the Group.

It should take up to 15 minutes for the project to import fully. You can head to the project's main page for the current status.

### Importing via the `import-project` script

A convenience script, `tools/import-project`, is provided with this project to import the Project tarball into a GitLab environment via API from the terminal.

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
  -h, --help               Show help message

Environment Variables:
  ACCESS_TOKEN             A valid GitLab Personal Access Token for the specified environment. The token should have admin access for the ability to import projects. (Default: nil)

Examples:
  import-project --environment-url onprem.testbed.gitlab.net
  import-project --environment-url localhost:3000 --project-tarball /home/user/test-project.tar.gz --namespace test-group --project-name test-project
```

The process should take up to 15 minutes for the project to import fully. The script will keep checking periodically for the status and exit once import has completed.

### Importing via GitHub

The last option is to [import the Project via the GitHub](https://docs.gitlab.com/ee/user/project/import/github.html):

1. Create the [Group](https://docs.gitlab.com/ee/user/group/#create-a-new-group) `qa-perf-testing`
2. Import the [GitLab CE backup on GitHub](https://github.com/gitlabhq/gitlabhq) into the Group via the UI.

This method will take longer to import than the other methods and will depend on several factors. It's recommended to use the other methods.

### Troubleshooting

In this section we'll detail any known issues we've seen when trying to import a project and how to manage them.

#### Gitaly calls error when importing

If you're attempting to import a large project into a development environment you may see Gitaly throw an error about too many calls or invocations, for example:

```
Error importing repository into qa-perf-testing/gitlabhq - GitalyClient#call called 31 times from single request. Potential n+1?
```

This is due to a [n+1 calls limit being set for development setups](https://docs.gitlab.com/ee/development/gitaly.html#toomanyinvocationserror-errors). You can work around this by setting `GITALY_DISABLE_REQUEST_LIMITS=1` as an environment variable, restarting your development environment and importing again.

## Access Token Setup

Many of the tests also require a GitLab Personal Access Token. This is due to numerous endpoints themselves requiring authentication.

[The official GitLab docs detail how to create this token](https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html#creating-a-personal-access-token). The tests require that the token is generated by an admin user and that it has the `API` and `read_repository` permissions.

Details on how to use the Access Token with each type of test are found in their respective documentation.
