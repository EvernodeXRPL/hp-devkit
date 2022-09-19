# HotPocket developer kit
Evernode uses HotPocket as its smart contract engine. HotPocket smart contracts can be developed using any POSIX-compliant language/framework. To make it easy to develop and test HotPocket smart contracts on your local PC, you can use HotPocket developer kit.

## Installation

### Prerequisites
HotPocket developer kit requires you to install [Docker Engine](https://docs.docker.com/engine/install/) and [NodeJs](https://nodejs.org/en/) on your development machine.

### Supports cross platform
This is a npm global package which supports both Linux and Windows
1. Install [prerequisites](#prerequisites).
2. Run the following command to install hpdevkit on your machine.
    ```
    npm i -g hpdevkit
    ```

## Updates
Update `hpdevkit` to the latest and update the supporting docker images.

Run one of following commands to update hpdevkit.
- Method 1 - Using hpdevkit CLI
    ```
    hpdevkit update
    ```

- Method 2 - Using npm
    ```
    npm update -g hpdevkit
    ```

**NOTE: You need to re-deploy your contracts to make the new changes effective.**

## Uninstall
Uninstall `hpdevkit` and the supporting docker images and containers.

- Using hpdevkit CLI
    ```
    hpdevkit uninstall
    ```

**NOTE: Uninstalling from hpdevkit CLI is recommended. If you uninstall using npm you'll have to clean hpdevkit supporting docker images and containers manually.**

_**NOTE:** In Linux platforms, for Installation, Update and Uninstallation you'll need root privileges. Add `sudo` to above commands._
