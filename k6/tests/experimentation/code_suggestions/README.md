## Running experimental Code Suggestions tests

### Setup environment

```
GPT_SKIP_ENV_CHECK=true
GPT_SKIP_VISIBILITY_CHECK=true
GPT_LARGE_PROJECT_CHECK_SKIP=true
ACCESS_TOKEN={VALID Personal AccessToken}

./bin/run-k6 --environment config/environments/experimentation/code_suggestions.json --tests=tests/experimentation/code_suggestions --options config/options/5s_2rps.json
```