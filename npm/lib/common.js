const fs = require('fs');
const archiver = require('archiver');

const appenv = require("../appenv");
const { exec } = require("./child-proc");
const { log, info, success } = require("./logger");
const { resolve } = require('path');

const GLOBAL_PREFIX = "hpdevkit";
const VERSION = "0.1.0";

const CONSTANTS = {
    npmPackageName: `hpdevkit`,
    volumeMount: `/${GLOBAL_PREFIX}_vol`,
    volume: `${GLOBAL_PREFIX}_${appenv.cluster}_vol`,
    network: `${GLOBAL_PREFIX}_${appenv.cluster}_net`,
    containerPrefix: `${GLOBAL_PREFIX}_${appenv.cluster}_node`,
    bundleMount: `${GLOBAL_PREFIX}_vol/contract_bundle`,
    deploymentContainerName: `${GLOBAL_PREFIX}_${appenv.cluster}_deploymgr`,
    confOverrideFile: "hp.cfg.override",
    codegenOutputDir: "/codegen-output",
    codegenContainerName: `${GLOBAL_PREFIX}_codegen`,
    contractCfgFile: "contract.config",
    prerequisiteInstaller: "install.sh"
};

function runOnContainer(name, detached, autoRemove, mountStock, mountVolume, entryCmd, entryPoint, interactive = true) {
    command = `docker run`;

    if (interactive)
        command += " -it";

    if (name)
        command += ` --name ${name}`;

    if (detached)
        command += " -d";

    if (autoRemove)
        command += " --rm";

    if (mountStock)
        command += " --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock";

    if (mountVolume)
        command += ` --mount type=volume,src=${CONSTANTS.volume},dst=${CONSTANTS.volumeMount}`;

    if (entryPoint)
        command += ` --entrypoint ${entryPoint}`;
    else
        command += " --entrypoint /bin/bash";

    command += ` -e CLUSTER=${appenv.cluster} -e CLUSTER_SIZE=${appenv.clusterSize} -e DEFAULT_NODE=${appenv.defaultNode} -e VOLUME=${CONSTANTS.volume} -e NETWORK=${CONSTANTS.network}`;
    command += ` -e CONTAINER_PREFIX=${CONSTANTS.containerPrefix} -e VOLUME_MOUNT=${CONSTANTS.volumeMount} -e BUNDLE_MOUNT=${CONSTANTS.bundleMount} -e HOTPOCKET_IMAGE=${appenv.instanceImage}`;
    command += ` -e CONFIG_OVERRIDES_FILE=${CONSTANTS.confOverrideFile} -e CODEGEN_OUTPUT=${CONSTANTS.codegenOutputDir}`;
    command += ` -e HP_USER_PORT_BEGIN=${appenv.hpUserPortBegin} -e HP_PEER_PORT_BEGIN=${appenv.hpPeerPortBegin}`;

    command += ` ${appenv.devkitImage}`;

    if (entryCmd) {
        if (entryPoint)
            command += ` ${entryCmd}`;
        else
            command += ` -c "${entryCmd}"`;
    }

    exec(command, true);
}

function executeOnContainer(name, cmd) {
    if (name)
        exec(`docker exec ${name}  /bin/bash -c "${cmd}"`, true);
}

function isExists(name, type = null) {
    try {
        const res = exec(`docker ${type === 'image' ? 'image ' : ''}inspect ${name}`);
        if (!res)
            return false;
        const resJson = JSON.parse(res.toString().trim());
        return !!(resJson && resJson.length);
    }
    catch (e) {
        return false;
    }
}

function initializeDeploymentCluster() {
    if (!isExists(CONSTANTS.deploymentContainerName)) {
        log("\nInitializing deployment cluster");

        // Stop cluster if running. Create cluster if not exists.
        runOnContainer(CONSTANTS.deploymentContainerName, null, true, true, null, 'cluster stop ; cluster create', null);

        // Spin up management container.
        runOnContainer(CONSTANTS.deploymentContainerName, true, false, true, true, null, null);

        // Bind the instance mesh network config together.
        executeOnContainer(CONSTANTS.deploymentContainerName, 'cluster bindmesh');
    }
}

function teardownDeploymentCluster() {
    exec(`docker stop ${CONSTANTS.deploymentContainerName}`);
    exec(`docker rm ${CONSTANTS.deploymentContainerName}`);
    runOnContainer(null, null, true, true, null, "cluster stop ; cluster destroy", null, false);
}

function updateDockerImages() {
    exec(`docker pull ${appenv.devkitImage}`);
    exec(`docker pull ${appenv.instanceImage}`, true);

    // Clear if there's already deployed cluster since they are outdated now.
    if (isExists(CONSTANTS.deploymentContainerName)) {
        info('\nCleaning the deployed contracts...');
        teardownDeploymentCluster();
    }
}

function archiveDirectory(sourcePath, destinationPath = null) {

    if (!sourcePath)
        throw "Invalid path was provided."

    // Create a file to stream archive data to
    const target = (destinationPath) ? `${destinationPath}/bundle.zip` : `${sourcePath}/bundle.zip`
    const output = fs.createWriteStream(target);
    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    // Callbacks
    output.on('close', () => {
        success(`Archive finished. (location: ${resolve(target)})`);
    });

    archive.on('error', (err) => {
        throw err;
    });

    // Pipe and append files
    archive.pipe(output);
    archive.directory(sourcePath, false);

    // Finalize
    archive.finalize();
}

module.exports = {
    runOnContainer,
    executeOnContainer,
    isExists,
    initializeDeploymentCluster,
    teardownDeploymentCluster,
    updateDockerImages,
    archiveDirectory,
    CONSTANTS
};