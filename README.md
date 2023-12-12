# HotPocket developer kit

This is the source repository of developer kit for HotPocket smart contract development. This toolkit makes use of Docker and NodeJS to provide a cross-platform HotPocket development tool for developers. Using the HotPocket developer kit, developers can spin-up local HotPocket clusters on their development machines and test HotPocket smart contracts.

We use Docker containers to run HotPocket and smart contracts in a Linux environment. We also use Docker containers and NodeJS for tooling so developers can use the tools on any platform as long as they install Docker and NodeJS.

<img width="829" alt="image" src="https://user-images.githubusercontent.com/33562092/236629093-f4357d2c-8e4c-43d4-9b52-8e76e5a4095e.png">

## Public documentation

https://github.com/EvernodeXRPL/evernode-sdk/blob/main/hpdevkit/index.md

## Prerequisites

- [Docker](https://docs.docker.com/engine/install/)
- [NodeJS](https://nodejs.org/)

## Docker build

Docker image containing cluster management shell scripts.

```
cd docker
docker build -t evernode/hpdevkit .
docker push evernode/hpdevkit
```

### Run

```
docker run -it --rm --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock evernode/hpdevkit cluster create 2
```

## hpdevkit npm build

hpdevkit is a cross-platform CLI tool distributed via NPM.

```
# local build
cd npm
npm install
npm run build

# publish to npm
npm login
npm run publish
```

### NPM package

https://www.npmjs.com/package/hpdevkit
