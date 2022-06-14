const HotPocket = require("hotpocket-nodejs-contract");

// Hot Pocket smart contract is defined as a function which takes the Hot Pocket ExecutionContext as an argument.
async function contract(ctx) {
    console.log("Hello #projname#", ctx);
}

const hpc = new HotPocket.Contract();
hpc.init(contract);