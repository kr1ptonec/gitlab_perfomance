# Git Pull over HTTPS test

* [Git Pull over HTTPS](#git-pull-over-https)
* [How does it work](#how-does-it-work)
* [Troubleshooting](#troubleshooting) 

## Git Pull over HTTPS

When user calls `git pull` to [download data](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols#_downloading_data), the [`fetch-pack`](https://git-scm.com/docs/git-fetch-pack) and [`upload-pack`](https://git-scm.com/docs/git-upload-pack) processes are involved. The client initiates a `fetch-pack` process that connects to an `upload-pack` process on the remote side to negotiate what data will be transferred down:

1. The first request is to list references of the current repository:
```
GET /qa-perf-testing/gitlabhq.git/info/refs?service=git-upload-pack HTTP/1.1
Host: localhost
Accept: */*
Accept-Encoding: deflate, gzip
Pragma: no-cache

```

Response example:
```
001e# service=git-upload-pack
000000fa691d88b71d51786983b823207d876cee7c93f5d4 HEADmulti_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed no-done symref=HEAD:refs/heads/master agent=git/2.22.0
0050eedcd0db2cbc11f683f152ef61a9b9a266563eff refs/heads/1-1-auto-deploy-0000001
(...)
```

2. The second request is to pull objects that `fetch-pack` process needs by sending “want” and then the SHA it wants:
```
POST /qa-perf-testing/gitlabhq.git/git-upload-pack HTTP/1.1
Host: localhost
Accept: application/x-git-upload-pack-result
Content-Type: application/x-git-upload-pack-request
Accept-Encoding: deflate, gzip

0054want 691d88b71d51786983b823207d876cee7c93f5d4 multi_ack side-band-64k ofs-delta\n
0032have eedcd0db2cbc11f683f152ef61a9b9a266563eff\n
00000009done\n
```

POST request body is using [pkt-line format](https://git-scm.com/docs/protocol-common#_pkt_line_format). The response to this request indicates success or failure, and includes the packfile.

## How does it work

Test is using Git Pull over HTTPS to pull from master having locally a branch:
1. Fetch commit SHA references of `master` and the `branch` from `mr_commits_iid` merge request in the [Environment JSON file](../k6.md#environments).
2. Send first Git Pull request that initiates a `fetch-pack` process that connects to an `upload-pack`:
```
GET /qa-perf-testing/gitlabhq.git/info/refs?service=git-upload-pack HTTP/1.1
```
2. Send second Git Pull request that pulls objects that `fetch-pack` process needs by sending "want" and then the SHA-1 it wants(`master` head SHA) and sending "have" with SHA client already has which is `branch` from the step 1:
```
POST /qa-perf-testing/gitlabhq.git/git-upload-pack HTTP/1.1

0054want 691d88b71d51786983b823207d876cee7c93f5d4 multi_ack side-band-64k ofs-delta\n
0032have eedcd0db2cbc11f683f152ef61a9b9a266563eff\n
00000009done\n
```

## Troubleshooting

* `GoError: Branch not found`

  - Branch was not found or user doesn't have [developer access](https://docs.gitlab.com/ee/user/permissions.html#project-members-permissions) to the project.
