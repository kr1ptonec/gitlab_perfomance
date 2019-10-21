# 1st Stage
FROM ruby:2.6.3-alpine AS build

ARG K6_VERSION="0.25.1"
ENV K6_VERSION="${K6_VERSION}"
ENV GEM_HOME="/usr/local/bundle"
ENV PATH $GEM_HOME/bin:$GEM_HOME/gems/bin:$PATH

ADD . /performance
WORKDIR /performance/k6

RUN cp ../Gemfile .
RUN apk add --no-cache gcc g++ make libc6-compat libc-dev curl wget tar
RUN gem install bundler -v 2.0.2 && export BUNDLER_VERSION=2.0.2 && export BUNDLE_PATH__SYSTEM=false && bundle install --without dev
RUN wget -q -P /tmp/ https://github.com/loadimpact/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux64.tar.gz && tar -xzvf /tmp/k6-v${K6_VERSION}-linux64.tar.gz -C /usr/local/bin --strip-components 1

# 2nd Stage
FROM ruby:2.6.3-alpine

ARG K6_VERSION="0.25.1"
ENV K6_VERSION="${K6_VERSION}"
ENV GEM_HOME="/usr/local/bundle"
ENV PATH $GEM_HOME/bin:$GEM_HOME/gems/bin:$PATH

COPY --from=build /usr/local/bin/k6 /usr/local/bin/k6
COPY --from=build /usr/local/bundle/ /usr/local/bundle/
COPY --from=build /performance/k6 /performance/k6
WORKDIR /performance/k6

RUN apk add --no-cache libc6-compat

VOLUME ["/performance/k6/environments"]
VOLUME ["/performance/k6/results"]

ENTRYPOINT ["./run-k6"]
CMD ["--help"]