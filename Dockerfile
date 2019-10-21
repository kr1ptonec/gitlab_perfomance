FROM ruby:2.6.3-alpine

ARG K6_VERSION="0.25.1"
ENV K6_VERSION="${K6_VERSION}"
ENV ACCESS_TOKEN=""

ADD . /performance
WORKDIR /performance/k6
VOLUME ["/results"]

RUN apk add --no-cache gcc g++ make libc6-compat libc-dev curl wget tar
RUN gem install bundler -v 2.0.2 && export BUNDLER_VERSION=2.0.2 && export BUNDLE_PATH__SYSTEM=false && bundle install --without dev
RUN wget -q -P /tmp/ https://github.com/loadimpact/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux64.tar.gz && tar -xzvf /tmp/k6-v${K6_VERSION}-linux64.tar.gz -C /usr/bin --strip-components 1

ENTRYPOINT ["./run-k6"]
CMD ["--help"]