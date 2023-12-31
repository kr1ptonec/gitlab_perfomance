/*global __ENV : true  */
import http from "k6/http";
import { fail, sleep } from "k6";
import { logError, versionIsLowerThanEnvVersion } from "./gpt_k6_modules.js";

//------------------- Git Pull-------------------//

// The client initiates a `fetch-pack` process that connects to an `upload-pack` 
// process on the remote side to negotiate what data will be transferred down.
export function getRefsListGitPull(project) {
  let params = {
    headers: {
      "Accept": "*/*",
      "Accept-Encoding": "deflate, gzip",
      "Pragma": "no-cache"
    }
  };
  let response = http.get(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}.git/info/refs?service=git-upload-pack`, params);
  return response;
}

// Post request to pull objects that `fetch-pack` process needs 
// by sending “want” and then the SHA-1 it wants = master head
// and sending "have" SHA-1 client already has = branch head with the biggest changes
export function pullRefsData(project, firstRefSHA, secondRefSHA) {
  let params = {
    headers: {
      "Accept": "application/x-git-upload-pack-result",
      "Accept-Encoding": "deflate, gzip",
      "Content-Type": "application/x-git-upload-pack-request"
    }
  };
  let body = `0054want ${firstRefSHA} multi_ack side-band-64k ofs-delta\n00000032have ${secondRefSHA}\n00000009done\n`;
  let response = http.post(`${__ENV.ENVIRONMENT_URL}/${project['unencoded_path']}.git/git-upload-pack`, body, params);
  return response;
}

// https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols#_downloading_data
// Get remote references SHA-1s to pull them later
export function getRefSHAs(project) {
  let largeBranchName = getLargeBranchName(project);
  let refsListResponse = getRefsListGitPull(project);
  let resBody = refsListResponse.body;
  let regexHeadRef = /001e# service=git-upload-pack\n[0-9a-f]{8}([0-9a-f]{40}) HEAD/;
  let headRefSHA = resBody.match(regexHeadRef)[1];
  let regexDiffHeadRef = new RegExp(`\n[0-9a-f]{4}([0-9a-f]{40}) refs/heads/${largeBranchName}\n`);
  let diffRefSHA = resBody.match(regexDiffHeadRef)[1];
  /20(0|1)/.test(refsListResponse.status) ? console.debug(`List of the remote references received`) : (logError(refsListResponse), fail("Error receiving references list"));
  headRefSHA ? console.debug(`Master head reference: ${headRefSHA}`) : fail("Master head reference not found");
  diffRefSHA ? console.debug(`Another branch head reference: ${diffRefSHA}`) : fail("Another branch head reference not found");
  return { headRefSHA, diffRefSHA };
}

export function getLargeBranchName(project) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/merge_requests/${project['mr_commits_iid']}`, params);
  let branchName = JSON.parse(res.body)['target_branch'];
  branchName ? console.debug(`Branch with a lot of commits: ${branchName}`) : fail("Branch not found");
  return branchName;
}

//------------------- Git Push ------------------- //

// https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols#_uploading_data
// The client initiates a `send-pack` process that connects to a `receive-pack`
export function getRefsListGitPush(authEnvUrl, project) {
  let params = {
    headers: {
      "Accept": "*/*",
      "Accept-Encoding": "deflate, gzip",
      "Pragma": "no-cache"
    },
    tags: {
      endpoint: 'get-refs-git-receive-pack'
    }
  };
  let response = http.get(`${authEnvUrl}/${project['unencoded_path']}.git/info/refs?service=git-receive-pack`, params);
  return response;
}

// Post request to push objects that `receive-pack` process needs 
export function pushRefsData(authEnvUrl, project) {
  let params = {
    headers: {
      "Accept": "application/x-git-receive-pack-result",
      "Content-Type": "application/x-git-receive-pack-request"
    },
    tags: {
      endpoint: 'post-git-receive-pack'
    }
  };
  let responses = http.batch([
    ["POST", `${authEnvUrl}/${project['unencoded_path']}.git/git-receive-pack`, project.data.branch_set_new_head, params],
    ["POST", `${authEnvUrl}/${project['unencoded_path']}.git/git-receive-pack`, project.data.branch_set_old_head, params]
  ]);
  return responses;
}

export function checkCommitExists(project, commit_sha) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}/repository/commits/${commit_sha}`, params);
  /20(0|1)/.test(res.status) ? console.log(`Commit #${commit_sha} exists`) : (logError(res), fail(`Commit #${commit_sha} does not exist or user doesn't have developer access to the project. Failing the git push test. ⚠️ Please refer to documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md`));
}

export function prepareGitPushData(projects) {
  projects.forEach(project => {
    try {
      project.data = {
        branch_set_old_head: open(`./push_data/data/set_old_head-${project['git_push_data']['branch_current_head_sha']}.bundle`, "b"),
        branch_set_new_head: open(`./push_data/data/set_new_head-${project['git_push_data']['branch_new_head_sha']}.bundle`, "b")
      }
    } catch (error) {
      console.error(`⚠️ ERROR: Git push data files not found. This is likely due to a data generation issue. Contact GitLab quality team for further support.`);
      project.data = false
    }
  });
  return projects;
}

export function updateProjectPipelinesSetting(project, state) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata;

  if (versionIsLowerThanEnvVersion('12.1.0')) {
    formdata = { builds_access_level: state ? "enabled" : "disabled" }
  } else {
    formdata = { jobs_enabled: state }
  }

  let res = http.put(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['encoded_path']}`, formdata, params);
  /20(0|1)/.test(res.status) ? console.log(`Project Pipelines setting changed to ${state}`) : (logError(res), fail(`Error occured when attempting to change Project Pipelines setting.`));
}

export function checkAdminAccess() {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/application/settings`, params);

  /20(0|1)/.test(res.status) ? console.log(`Access Token given does have required Admin access for this test. Continuing...`) : (logError(res), fail(`Access Token given does not have required Admin access for this test. Exiting...`));
}

export function waitForGitSidekiqQueue() {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res, queueSize;

  console.log('Waiting for all Sidekiq enqueued jobs to finish before proceeding...')

  do {
    sleep(5);
    res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/sidekiq/job_stats`, params);
    queueSize = JSON.parse(res.body)['jobs']['enqueued'];
    queueSize > 0 ? console.log(`Sidekiq enqueue is currently ${queueSize}. Waiting...`) : console.log(`Sidekiq enqueue is ${queueSize}. Proceeding...`)
  }
  while (queueSize > 0);
}
