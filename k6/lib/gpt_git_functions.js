/*global __ENV : true  */
import http from "k6/http";
import { fail } from "k6";
import { logError } from "./gpt_k6_modules.js";

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
  let response = http.get(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}.git/info/refs?service=git-upload-pack`, params);
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
  let response = http.post(`${__ENV.ENVIRONMENT_URL}/${project['group']}/${project['name']}.git/git-upload-pack`, body, params);
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
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/merge_requests/${project['mr_commits_iid']}`, params);
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
    }
  };
  let response = http.get(`${authEnvUrl}/${project['group']}/${project['name']}.git/info/refs?service=git-receive-pack`, params);
  return response;
}

// Post request to push objects that `receive-pack` process needs 
export function pushRefsData(authEnvUrl, project) {
  let params = {
    headers: {
      "Accept": "application/x-git-receive-pack-result",
      "Content-Type": "application/x-git-receive-pack-request"
    }
  };
  let responses = http.batch([
    ["POST", `${authEnvUrl}/${project['group']}/${project['name']}.git/git-receive-pack`, project.data.branch_set_new_head, params],
    ["POST", `${authEnvUrl}/${project['group']}/${project['name']}.git/git-receive-pack`, project.data.branch_set_old_head, params]
  ]);
  return responses;
}

export function checkCommitExists(project, commit_sha) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let res = http.get(`${__ENV.ENVIRONMENT_URL}/api/v4/projects/${project['group']}%2F${project['name']}/repository/commits/${commit_sha}`, params);
  /20(0|1)/.test(res.status) ? console.log(`Commit #${commit_sha} exists`) : (logError(res), fail(`Commit #${commit_sha} does not exist or user doesn't have developer access to the project. Failing the git push test. ⚠️ Please refer to documentation: https://gitlab.com/gitlab-org/quality/performance/-/blob/master/docs/test_docs/git_push.md`));
}

export function prepareGitPushData(projects) {
  projects.forEach(project => {
    try {
      project.data = {
        branch_set_old_head: open(`./push_data/data/set_old_head-${project['name']}-${project['git_push_data']['branch_current_head_sha']}.bundle`, "b"),
        branch_set_new_head: open(`./push_data/data/set_new_head-${project['name']}-${project['git_push_data']['branch_new_head_sha']}.bundle`, "b")
      }
    } catch (error) {
      console.error(`⚠️ ERROR: Git push data files not found: '${error}'`);
      project.data = false
    }
  });
  return projects;
}

// Project Pipelines should be disabled before git push. Otherwise git push will trigger pipelines en masse.
export function updateProjectPipelinesSetting(project, state) {
  let params = { headers: { "Accept": "application/json", "PRIVATE-TOKEN": `${__ENV.ACCESS_TOKEN}` } };
  let formdata = { builds_access_level: state };
  let res = http.put(`${__ENV.ENVIRONMENT_URL}/api/v4/rojects/${project['group']}%2F${project['name']}`, formdata, params);
  /20(0|1)/.test(res.status) ? console.log(`Project Pipelines setting was ${state}`) : (logError(res), fail(`Error with Project Pipelines setting update.`));
}
