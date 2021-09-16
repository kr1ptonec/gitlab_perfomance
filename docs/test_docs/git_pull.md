# Git Pull/Clone over HTTPS test

[[_TOC_]]

## Git Pull over HTTPS

When user calls `git pull` to [download data](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols#_downloading_data), the [`fetch-pack`](https://git-scm.com/docs/git-fetch-pack) and [`upload-pack`](https://git-scm.com/docs/git-upload-pack) processes are involved. The client initiates a `fetch-pack` process that connects to an `upload-pack` process on the remote side to negotiate what data will be transferred down:

1. The first request is to list references of the current repository:

    ```txt
    GET /qa-perf-testing/gitlabhq.git/info/refs?service=git-upload-pack HTTP/1.1
    Host: localhost
    Accept: */*
    Accept-Encoding: deflate, gzip
    Pragma: no-cache

    ```

    Response example:

    ```txt
    001e# service=git-upload-pack
    000000fa691d88b71d51786983b823207d876cee7c93f5d4 HEADmulti_ack thin-pack side-band side-band-64k ofs-delta shallow deepen-since deepen-not deepen-relative no-progress include-tag multi_ack_detailed no-done symref=HEAD:refs/heads/master agent=git/2.22.0
    0050eedcd0db2cbc11f683f152ef61a9b9a266563eff refs/heads/1-1-auto-deploy-0000001
    (...)
    ```

1. The second request is to pull objects that `fetch-pack` process needs by sending “want” and then the SHA it wants:

    ```txt
    POST /qa-perf-testing/gitlabhq.git/git-upload-pack HTTP/1.1
    Host: localhost
    Accept: application/x-git-upload-pack-result
    Content-Type: application/x-git-upload-pack-request
    Accept-Encoding: deflate, gzip

    0054want 691d88b71d51786983b823207d876cee7c93f5d4 multi_ack side-band-64k ofs-delta
    0032have eedcd0db2cbc11f683f152ef61a9b9a266563eff
    0009done

    ```

    POST request body is using [pkt-line format](https://git-scm.com/docs/protocol-common#_pkt_line_format). The response to this request indicates success or failure, and includes the packfile.

## How does it work

Test is using Git Pull over HTTPS to pull from `want_commit_sha` having locally a `have_commit_sha`:

1. Send first Git Pull request that initiates a `fetch-pack` process that connects to an `upload-pack`:

    ```txt
    GET /qa-perf-testing/gitlabhq.git/info/refs?service=git-upload-pack HTTP/1.1
    ```

1. Send a second Git Pull request that pulls objects that `fetch-pack` process needs by sending "want" and then the SHA-1 it wants(`want_commit_sha`) and sending "have" with SHA client already has which is `have_commit_sha` in the [Environment JSON file](../k6.md#environments):

```txt
POST /qa-perf-testing/gitlabhq.git/git-upload-pack HTTP/1.1

0054want 691d88b71d51786983b823207d876cee7c93f5d4 multi_ack side-band-64k ofs-delta
0032have eedcd0db2cbc11f683f152ef61a9b9a266563eff
0009done

```

## Git Clone over HTTPS

Git Clone over HTTPS uses the similar requests as [Git Pull over HTTPS](#git-pull-over-https) with a single difference that
in the second request to `git-upload-pack` it sends only “want” SHA and omits "have" like so:

```txt
POST /qa-perf-testing/gitlabhq.git/git-upload-pack HTTP/1.1
Host: localhost
Accept: application/x-git-upload-pack-result
Content-Type: application/x-git-upload-pack-request
Accept-Encoding: deflate, gzip

0054want 691d88b71d51786983b823207d876cee7c93f5d4 multi_ack side-band-64k ofs-delta
00000009done

```

## Troubleshooting

* `Commit #efc9f72c9ffaa76f966b8c162a9d184d7aa1ff18 does not exist or user doesn't have developer access to the project.`

  * Commits specified in the environment file don't exist in the project. Please specify valid existing commit SHAs for the projects.
  * User doesn't have [developer access](https://docs.gitlab.com/ee/user/permissions.html#project-members-permissions) to the project.
