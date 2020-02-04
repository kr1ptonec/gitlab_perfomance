# 1st Stage
FROM ruby:2.6-alpine AS build

ARG K6_VERSION="0.26.0"
ENV K6_VERSION="${K6_VERSION}"
ENV GEM_HOME="/usr/local/bundle"
ENV PATH $GEM_HOME/bin:$GEM_HOME/gems/bin:$PATH

ADD . /performance
WORKDIR /performance

RUN apk add --no-cache build-base curl wget tar
RUN gem install bundler && bundle config without dev && bundle install
RUN wget -q -P /tmp/ https://github.com/loadimpact/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux64.tar.gz && tar -xzvf /tmp/k6-v${K6_VERSION}-linux64.tar.gz -C /usr/local/bin --strip-components 1

# 2nd Stage
FROM ruby:2.6-alpine

ENV GEM_HOME="/usr/local/bundle"
ENV PATH $GEM_HOME/bin:$GEM_HOME/gems/bin:$PATH

ENV GPT_DOCKER=true
ENV GPT_DOCKER_ENV_DIR=/environments
ENV GPT_DOCKER_OPTIONS_DIR=/options
ENV GPT_DOCKER_TESTS_DIR=/tests
ENV GPT_DOCKER_RESULTS_DIR=/results

COPY --from=build /usr/local/bin/k6 /usr/local/bin/k6
COPY --from=build /usr/local/bundle/ /usr/local/bundle/
COPY --from=build /performance /performance
WORKDIR /performance

RUN apk add --no-cache libc6-compat

ENTRYPOINT ["./bin/run-k6"]
CMD ["--help"]
