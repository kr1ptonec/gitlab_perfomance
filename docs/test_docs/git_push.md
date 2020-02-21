# Git Push over HTTPS test

* [Git Push over HTTPs](#git-push-over-https)
* [Git Push test](#git-push-test)
  * [Git Push commits to the existing branch](#git-push-commits-to-the-existing-branch)
  * [Git Push new branch from the existing commit](#git-push-new-branch-from-the-existing-commit)
* [How does it work](#how-does-it-work)
* [Troubleshooting](#troubleshooting)  

## Git Push over HTTPS

To [upload data](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols#_uploading_data) to a remote process, Git uses the [`send-pack`](https://git-scm.com/docs/git-send-pack) and [`receive-pack`](https://git-scm.com/docs/git-receive-pack) processes. The `send-pack` process runs on the client and connects to a `receive-pack` process on the remote side.

1. The connection to the server is initiated with this request:
```
GET /qa-perf-testing/gitlabhq.git/info/refs?service=git-receive-pack HTTP/1.1
Host: localhost
Accept: */*
Accept-Encoding: deflate, gzip
Pragma: no-cache
Authorization: Basic {basicAuthToken}
```

Response example:
```
001f# service=git-receive-pack
000000adeedcd0db2cbc11f683f152ef61a9b9a266563eff refs/heads/1-1-auto-deploy-0000001report-status delete-refs side-band-64k quiet atomic ofs-delta push-options agent=git/2.22.0
0050b7524d0889c8e1d4afb698d9c6982ae6116049b5 refs/heads/1-1-auto-deploy-0000002
(...)
```

The returned content is a UNIX formatted text file describing each ref and its known value.

2. The client then makes another request, this time a POST, with the data that send-pack provides:
```
POST /qa-perf-testing/gitlabhq.git/git-receive-pack HTTP/1.1
Host: localhost
Accept: application/x-git-receive-pack-result
Authorization: Basic {basicAuthToken}
Content-Type: application/x-git-receive-pack-request

{ Packfile binary data }
```

The POST request includes the send-pack output and the packfile as its payload. The server then indicates success or failure with its HTTP response.


## Git Push test

Specify `branch_current_head_sha`, `branch_new_head_sha` and `branch_name` in the Environment file to automatically generate binary data for git push test. The size of the commits should be tuned to your environment's requirements.

Git push test can load in two modes:
1. [Git push commits to the existing branch](#git-push-commits-to-the-existing-branch):
  a. `git reset --soft HEAD~N` - undo N commits on the branch. If N = 1, it will be a second to last commit.
  b. `git reset 'HEAD@{N}'` - restore N commits on the branch
2. [Git push new branch from the existing commit](#git-push-new-branch-from-the-existing-commit):
  a. `git checkout -b new-branch-name branch_head_sha` - create new branch from the existing `branch_head_sha` commit
  b. `git push origin --delete new-branch-name` - delete created branch

#### Git Push commits to the existing branch

Specify `git_push_data` in the Environment file:
* `branch_current_head_sha` - The head commit of the `existing_branch_name` branch.
* `branch_new_head_sha` - Any commit SHA that older then `branch_current_head_sha` on the `existing_branch_name` branch.
* `branch_name` - Existing branch name. Name length should be less than 100 chars.

For example, branch `existing_branch_name` has 5 commits: 
```
commit_1_sha(oldest) -> commit_2_sha -> commit_3_sha -> commit_4_sha -> commit_5_sha(head)
```
If we want to test git push for the last two commits: 
```
"git_push_data": {
        "branch_current_head_sha": "commit_5_sha",
        "branch_new_head_sha": "commit_3_sha",
        "branch_name": "existing_branch_name"
  }
```

#### Git Push new branch from the existing commit

Specify `git_push_data` in the Environment file:
* `branch_current_head_sha` - Empty commit sha "0000000000000000000000000000000000000000". 0 means that there was no old head commit and we want to create a new branch. 
* `branch_new_head_sha` - Any existing commit SHA from the necessary branch.
* `branch_name` - New unique branch name that will be created.

If we want to test git push for new branch `new_unique_branch_name`: 
```
"git_push_data": {
        "branch_current_head_sha": "0000000000000000000000000000000000000000",
        "branch_new_head_sha": "commit_5_sha",
        "branch_name": "new_unique_branch_name"
  }
```

#### How does it work

Packfile that is being sent to `receive-pack` has a similar [structure](https://git-scm.com/docs/pack-protocol/2.6.0#_reference_update_request_and_packfile_transfer):
```
len(pkt-line)+ oldhead(0 means a new one) + newhead(existing_commit_sha) + packProtocolCapabilities + pktFlushStr + PACK + git binary data
```

The beginning of the request body(in case of "Git push new branch from the existing commit" mode):
```
009b0000000000000000000000000000000000000000 d3016d86a9c0855d94e2da53b9512974a7795b8f refs/heads/git-pushtest report-status side-band-64k agent=git/2.22.00000
```
* `009b` - [pkt-line](https://git-scm.com/docs/pack-protocol/2.6.0#_pkt_line_format) length(hex value)
* `0000000000000000000000000000000000000000` - The current head commit SHA. 0 means that there was no old head commit and we want to create a new branch. In "Git push commits to the existing branch" there will be a current head SHA of the branch.
* `d3016d86a9c0855d94e2da53b9512974a7795b8f` - The new head commit SHA that will be set for the specified branch.
* `refs/heads/git-pushtest` - Branch name
* `report-status side-band-64k agent=git/2.22.0` - [Pack protocol capabilities](https://git-scm.com/docs/protocol-capabilities/2.22.2)

The information above should be combined with binary data. A packfile [MUST be sent](https://git-scm.com/docs/pack-protocol/2.6.0#_reference_update_request_and_packfile_transfer) if either create or update command is used, even if the server already has all the necessary objects. Since we're using existing commits, we can use any pack binary data, it will be ignored by Git anyway. We utilize [hardcoded binary data](../../k6/tests/git/push_data/binary_data.bundle) for this purpose. 

In case you want to create a packfile manually use [`git bundle`](https://git-scm.com/docs/git-bundle):

```
git bundle create ../push_data.bundle master ^existing_branch_name
```

The command above will create `push_data.bundle` file. Copy everything that goes after the `PACK` and add it to the beginning of the request body, so the result will look like this:
```
009b0000000000000000000000000000000000000000 d3016d86a9c0855d94e2da53b9512974a7795b8f refs/heads/git-pushtest report-status side-band-64k agent=git/2.22.00000PACK{binary_data}
```

To intercept git requests and learn more about the objects set up this configuration:
1. Initialize repository or `git clone` an existing one with http(s) remote repository URL.
2. Configure the [HTTP proxy](https://git-scm.com/docs/git-config#Documentation/git-config.txt-httpproxy) for Git repository: `git config http.proxy http://localhost:8888`
3. Use any HTTPS proxy tool of your choice, for example [mitmproxy](https://mitmproxy.org/).

## Troubleshooting

* `Commit #efc9f72c9ffaa76f966b8c162a9d184d7aa1ff18 does not exist or user doesn't have developer access to the project. Failing the git push test.`

  - Commits specified in the environment file don't exist in the project. Please specify valid existing commit SHAs for the projects and generate git push data for them.
  - User doesn't have [developer access](https://docs.gitlab.com/ee/user/permissions.html#project-members-permissions) to the project.

* `ERROR: Git push data files not found: 'GoError: stat /k6/tests/git/push_data/data/set_old_head-gitlabhq-8606c89683c913641243fc667edeb90600fe1a0e.bundle: no such file or directory'`

  - No git push binary data files found, please ensure data was generated in [`data`](data) folder for commits that you specified for the environment.

  * `Error with Project Pipelines setting update.`

  - Ensure that Access Token grants the permission to update projects settings. Before git push test, Projects Pipeline setting should be disabled, otherwise git push will trigger pipelines en masse.
