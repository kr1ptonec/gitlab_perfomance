/*global __ENV : true  */
/*
@endpoint: `POST /completions`
@example_uri: /v2/completions
@description: [Beta Code suggestions](https://docs.gitlab.com/ee/user/project/repository/code_suggestions.html)
@gpt_data_version: 1
*/

import http from "k6/http";
import { check } from 'k6';
import { group } from "k6";
import { Rate } from "k6/metrics";
import { logError, getRpsThresholds, getTtfbThreshold } from "../../../lib/gpt_k6_modules.js";

export let successRate = new Rate("successful_requests")

export const options = {
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(90)<3000', 'p(95)<5000'],
    },
};

export default function() {
    group("Beta - Experimentation - AI - Completions", function() {
        let params = {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${__ENV.ACCESS_TOKEN}`
            }
        };
        let body = {
            "prompt_version": 1,
            "project_path": "gitlab-org/gitlab",
            "project_id": 278964,
            "current_file": {
                "file_name": "add_file_template_spec.rb",
                "content_above_cursor": "# frozen_string_literal: true\n\nmodule QA\n  RSpec.describe 'Create' do\n    describe 'File templates', product_group: :source_code do\n      include Runtime::Fixtures\n\n      let(:project) do\n        Resource::Project.fabricate_via_api! do |project|\n          project.name = 'file-template-project'\n          project.description = 'Add file templates via the Files view'\n          project.initialize_with_readme = true\n        end\n      end\n\n      templates = [\n        {\n          file_name: '.gitignore',\n          name: 'Android',\n          api_path: 'gitignores',\n          api_key: 'Android',\n          testcase: 'https://gitlab.com/gitlab-org/gitlab/-/quality/test_cases/347659'\n        },\n        {\n          file_name: '.gitlab-ci.yml',\n          name: 'Julia',\n          api_path: 'gitlab_ci_ymls',\n          api_key: 'Julia',\n          testcase: 'https://gitlab.com/gitlab-org/gitlab/-/quality/test_cases/347658'\n        },\n        {\n          file_name: 'Dockerfile',\n          name: 'Python',\n          api_path: 'dockerfiles',\n          api_key: 'Python',\n          testcase: 'https://gitlab.com/gitlab-org/gitlab/-/quality/test_cases/347660'\n        },\n        {\n          file_name: 'LICENSE',\n          name: 'Mozilla Public License 2.0',\n          api_path: 'licenses',\n          api_key: 'mpl-2.0',\n          testcase: 'https://gitlab.com/gitlab-org/gitlab/-/quality/test_cases/347657'\n        },",
                "content_below_cursor": "\n      ]\n\n      templates.each do |template|\n        it \"user adds #{template[:file_name]} via file template #{template[:name]}\", testcase: template[:testcase] do\n          content = fetch_template_from_api(template[:api_path], template[:api_key])\n\n          Flow::Login.sign_in\n\n          project.visit!\n"
            }
        }

        let res = http.post(`${__ENV.ENVIRONMENT_URL}/v2/completions`, JSON.stringify(body), params);
        check(res, {
            'is status 200': (r) => r.status === 200,
        });
        check(res, {
            'verify response has choices': (r) =>
                r.body.includes('choices'),
        });
        /200/.test(res.status) ? successRate.add(true) : (successRate.add(false), logError(res));
    });
}
