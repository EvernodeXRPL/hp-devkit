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
```
hpdevkit update
```

## Uninstall
Uninstall `hpdevkit` and the supporting docker images and containers.
```
hpdevkit uninstall
```

_**NOTE:** For Installation, Update and Uninstallation you'll need root privileges for Linux platforms, Add `sudo` to above commands._
