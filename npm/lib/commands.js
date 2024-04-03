const fs = require('fs');
const appenv = require('../appenv');
const kp = require('ripple-keypairs');
const evernode = require("evernode-js-client")
const { exec } = require('./child-proc');
const {
    CONSTANTS,
    initializeDeploymentCluster,
    runOnNewContainer,
    executeOnManagementContainer,
    teardownDeploymentCluster,
    isExists,
    updateDockerImages
} = require('./docker-helpers');
const { success, error, info, warn } = require('./logger');

function version() {
    info(`command: version`);

    try {
        const res = exec(`npm -g list ${CONSTANTS.npmPackageName} --depth=0`);
        const splitted = res.toString().split('\n');
        if (splitted.length > 1) {
            success(`\n${splitted[1].split('@')[1]}\n`);
            return;
        }
    }
    catch (e) { }

    error(`\n${CONSTANTS.npmPackageName} is not installed.`);
}

function list(platform) {
    info("List templates\n");

    try {
        runOnNewContainer(CONSTANTS.codegenContainerName, null, null, null, null, platform ? `list ${platform}` : 'list', 'templates');
    }
    catch (e) {
        error(`Listing templates failed.`);
    }
    finally {
        if (isExists(CONSTANTS.codegenContainerName))
            exec(`docker rm ${CONSTANTS.codegenContainerName}`, false);
    }
}

function codeGen(platform, apptype, projName) {
    info("Code generator\n");

    if (fs.existsSync(projName)) {
        error(`Directory '${projName}' already exists.`);
        return;
    }

    try {
        runOnNewContainer(CONSTANTS.codegenContainerName, null, null, null, null, `${platform} ${apptype} ${projName}`, 'codegen');
        exec(`docker cp ${CONSTANTS.codegenContainerName}:${CONSTANTS.codegenOutputDir} ./${projName}`);
        success(`Project '${projName}' created.`);
    }
    catch (e) {
        error(`Project '${projName}' generation failed.`);
    }
    finally {
        if (isExists(CONSTANTS.codegenContainerName))
            exec(`docker rm ${CONSTANTS.codegenContainerName}`, false);
    }
}

async function deploy(contractPath, options) {
    info(`command: deploy (cluster: ${appenv.cluster})`);

    if (options.multiSig && !options.masterSec) {
        error('Master secret is required to setup multi signing!');
        return;
    }

    initializeDeploymentCluster();

    // If copying a directory, delete target bundle directory. If not create empty target bundle directory to copy a file.
    const prepareBundleDir = contractPath ?
        `rm -rf ${CONSTANTS.bundleMount}` :
        `mkdir -p ${CONSTANTS.bundleMount} && rm -rf ${CONSTANTS.bundleMount}/* ${CONSTANTS.bundleMount}/.??*`;

    executeOnManagementContainer(prepareBundleDir);
    exec(`docker cp ${contractPath} "${CONSTANTS.managementContainerName}:${CONSTANTS.bundleMount}"`);

    // Prepare signers if multisig specified
    if (options.multiSig) {
        if (!options.masterAddr) {
            const keypair = kp.deriveKeypair(options.masterSec);
            options.masterAddr = kp.deriveAddress(keypair.publicKey);
        }

        let signers = [];
        for (let i = 0; i < appenv.clusterSize; i++) {
            const nodeSecret = kp.generateSeed({ algorithm: "ecdsa-secp256k1" });
            const keypair = kp.deriveKeypair(nodeSecret);
            const signerInfo = {
                account: kp.deriveAddress(keypair.publicKey),
                secret: nodeSecret,
                weight: appenv.signerWeight
            };

            signers.push(signerInfo);

            const disparatePath = `${CONSTANTS.bundleMount}/${CONSTANTS.disparateDir}/${i + 1}`;
            executeOnManagementContainer(`mkdir -p ${disparatePath} && echo '${JSON.stringify(signerInfo).replace(/"/g, '\\"')}' | jq . > ${disparatePath}/${options.masterAddr}.key`);
        }

        await evernode.Defaults.useNetwork(appenv.network);
        const xrplApi = new evernode.XrplApi(null);
        evernode.Defaults.set({
            xrplApi: xrplApi
        });
        await xrplApi.connect();
        const xrplAcc = new evernode.XrplAccount(options.masterAddr, options.masterSec);

        try {
            const totalWeights = signers.reduce((sum, x) => sum + x.weight, 0);
            await xrplAcc.setSignerList(signers.map(s => {
                return {
                    account: s.account,
                    weight: s.weight
                };
            }), { signerQuorum: Math.floor(totalWeights * appenv.signerQuorum) });
            await xrplApi.disconnect();
        }
        catch (e) {
            error('Error occurred while preparing the signer list', e);
            await xrplApi.disconnect();
            return;
        }

        info(`Multi signer setup for ${options.masterAddr} completed!`);
    }

    // Sync contract bundle to all instance directories in the cluster.
    executeOnManagementContainer('cluster stop ; cluster sync ; cluster start');

    if (appenv.defaultNode > 0) {
        info(`Streaming logs of node ${appenv.defaultNode}:`);
        executeOnManagementContainer(`cluster logs ${appenv.defaultNode}`);
    }
}

function spawn() {
    info(`command: spawn (cluster: ${appenv.cluster})`);

    executeOnManagementContainer('cluster spawn && cluster logs 999999');
}

function clean() {
    info(`command: clean (cluster: ${appenv.cluster})`);

    teardownDeploymentCluster();
}

function logs(nodeNumber) {
    info(`command: logs (cluster: ${appenv.cluster})`);

    executeOnManagementContainer(`cluster logs ${nodeNumber}`);
}

function start(nodeNumber) {
    info(`command: start (cluster: ${appenv.cluster})`);

    executeOnManagementContainer(`cluster start ${nodeNumber}`);
}

function stop(nodeNumber) {
    info(`command: stop (cluster: ${appenv.cluster})`);

    executeOnManagementContainer(`cluster stop ${nodeNumber}`);
}

function status() {
    info(`command: status (cluster: ${appenv.cluster})`);

    executeOnManagementContainer(`cluster status`);
}

function update() {
    info(`command: update`);

    // Update npm package if outdated (Docker images will be updated from there). Otherwise only update the docker images.
    try {
        exec(`npm -g outdated ${CONSTANTS.npmPackageName}`);
        info('\nUpdating docker images...');
        updateDockerImages();
    }
    catch (e) {
        const splitted = e.stdout.toString().trim().split('\n').map(l => l.trim().split(/\s+/));
        if (splitted.length > 1) {
            info(`\nUpdating ${CONSTANTS.npmPackageName} npm package...`);
            exec(`npm -g install ${CONSTANTS.npmPackageName}@${splitted[1][3]}`, true);
        }
    }

    success('\nUpdate Completed !!');
    warn('NOTE: You need to re-deploy your contracts to make the new changes effective.');
}

function uninstall() {
    info(`command: uninstall`);

    info(`\nUninstalling ${CONSTANTS.npmPackageName} npm package...`);
    exec(`npm -g uninstall ${CONSTANTS.npmPackageName}`, true);

    // Remove deployment cluster if exist.
    if (isExists(CONSTANTS.managementContainerName)) {
        info('\nCleaning the deployed contracts...');
        teardownDeploymentCluster();
    }

    // Remove docker images if exist.
    if (isExists(appenv.devkitImage, 'image')) {
        info('\nRemoving devkit docker image...');
        exec(`docker image rm ${appenv.devkitImage}`, true);
    }

    if (isExists(appenv.instanceImage, 'image')) {
        info('\nRemoving instance docker image...');
        exec(`docker image rm ${appenv.instanceImage}`, true);
    }

    success('\nUninstalled hpdevkit !!');
}

module.exports = {
    version,
    list,
    codeGen,
    deploy,
    clean,
    logs,
    start,
    stop,
    spawn,
    status,
    update,
    uninstall
};