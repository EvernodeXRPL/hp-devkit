# HotPocket developer kit
Evernode uses HotPocket as its smart contract engine. HotPocket smart contracts can be developed using any POSIX-compliant language/framework. To make it easy to develop and test HotPocket smart contracts on your local PC, you can use HotPocket developer kit.

## Installation

### Prerequisites
HotPocket developer kit requires you to install [Docker Engine](https://docs.docker.com/engine/install/) and [NodeJs](https://nodejs.org/en/) on your development machine.

### Supports cross platform
This is a npm global package which supports both Linux and Windows
```
npm i -g hpdevkit
```

## Updates
Update `hpdevkit` to the latest and update the supporting docker images.
### Using npm
```
npm update -g hpdevkit-testdev
```

### Using hpdevkit CLI
```
hpdevkit update
```

**NOTE: You need to re-deploy your contracts to make the new changes effective.**

## Uninstall
Uninstall `hpdevkit` and the supporting docker images and containers.

### Using hpdevkit CLI
```
hpdevkit uninstall
```

**NOTE: Uninstalling from hpdevkit CLI is recommended. If you uninstall using npm you'll have to clean hpdevkit supporting docker images and containers manually.**

_**NOTE:** For Installation, Update and Uninstallation you'll need root privileges for Linux platforms, Add `sudo` to above commands._
