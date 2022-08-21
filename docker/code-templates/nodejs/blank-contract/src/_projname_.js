const HotPocket = require("hotpocket-nodejs-contract");

const _projname_ = async (ctx) => {
    // Your smart contract logic.
    console.log('Blank contract');
}

const hpc = new HotPocket.Contract();
hpc.init(_projname_);