# This image contains scripts for creating HotPocket contract clusters
# on the developer machine for local development testing.
# docker build -t evernode/hpdevkit .
# docker push evernode/hpdevkit

FROM ubuntu:focal as builder
RUN apt-get update && apt-get install -y wget

WORKDIR /build

# Download and extract docker.
RUN wget -O docker.deb https://download.docker.com/linux/ubuntu/dists/focal/pool/stable/amd64/docker-ce-cli_20.10.9~3-0~ubuntu-focal_amd64.deb
RUN dpkg -x docker.deb docker-extracted

# Download jq
RUN wget -O jq https://github.com/stedolan/jq/releases/download/jq-1.6/jq-linux64
RUN chmod +x jq

# Set permissions for hotpocket devkit scripts.
COPY scripts /build/scripts
RUN chmod -R +x /build/scripts/*.sh

FROM ubuntu:focal as runner
COPY --from=builder /build/docker-extracted/usr/bin/docker /usr/bin/
COPY --from=builder /build/scripts/cluster.sh /usr/bin/cluster
COPY --from=builder /build/scripts/codegen.sh /usr/bin/codegen
COPY --from=builder /build/jq /usr/bin/jq

COPY code-templates /code-templates
COPY evernode-license.pdf /evernode-license.pdf