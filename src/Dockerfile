# This image contains scripts for creating Hot Pocket contract clusters
# on the developer machine for local development testing.

FROM ubuntu:focal as builder
RUN apt-get update && apt-get install -y wget

WORKDIR /build

# Download and extract docker.
RUN wget -O docker.deb https://download.docker.com/linux/ubuntu/dists/focal/pool/stable/amd64/docker-ce-cli_20.10.9~3-0~ubuntu-focal_amd64.deb
RUN dpkg -x docker.deb docker-extracted

# Set permissions for hot pocket devkit scripts.
COPY scripts /build/scripts
RUN chmod -R +x /build/scripts/*.sh

FROM ubuntu:focal as runner
COPY --from=builder /build/docker-extracted/usr/bin/docker /usr/bin/
COPY --from=builder /build/scripts/cluster.sh /usr/bin/cluster

# docker build -t hpdevtoolkit .
# docker run --rm --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock hpdevtoolkit cluster