const appenv = require("../appenv");
const { exec } = require("./child-proc");
const { log, info } = require("./logger");

const GLOBAL_PREFIX = "hpdevkit";

const CONSTANTS = {
    npmPackageName: `hpdevkit`,
    volumeMount: `/${GLOBAL_PREFIX}_vol`,
    volume: `${GLOBAL_PREFIX}_${appenv.cluster}_vol`,
    network: `${GLOBAL_PREFIX}_${appenv.cluster}_net`,
    containerPrefix: `${GLOBAL_PREFIX}_${appenv.cluster}_node`,
    bundleMount: `${GLOBAL_PREFIX}_vol/contract_bundle`,
    managementContainerName: `${GLOBAL_PREFIX}_${appenv.cluster}_deploymgr`,
    confOverrideFile: "hp.cfg.override",
    codegenOutputDir: "/codegen-output",
    codegenContainerName: `${GLOBAL_PREFIX}_codegen`,
    contractCfgFile: "contract.config",
    prerequisiteInstaller: "install.sh"
};

function runOnNewContainer(name, detached, autoRemove, mountSock, mountVolume, entryCmd, entryPoint, interactive = true, restart = null) {
    command = `docker run`;

    if (interactive)
        command += " -it";

    if (name)
        command += ` --name ${name}`;

    if (detached)
        command += " -d";

    if (autoRemove)
        command += " --rm";

    if (mountSock)
        command += " --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock";

    if (mountVolume)
        command += ` --mount type=volume,src=${CONSTANTS.volume},dst=${CONSTANTS.volumeMount}`;

    if (entryPoint)
        command += ` --entrypoint ${entryPoint}`;
    else
        command += " --entrypoint /bin/bash";

    if (restart)
        command += ` --restart ${restart}`;

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

function executeOnManagementContainer(cmd) {
    if (!isExists(CONSTANTS.managementContainerName)) {
        info(`cluster '${appenv.cluster}' not found.`)
        return;
    }

    executeOnContainer(CONSTANTS.managementContainerName, cmd)
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
    if (!isExists(CONSTANTS.managementContainerName)) {
        log("\nInitializing deployment cluster");

        // Stop cluster if running. Create cluster if not exists.
        runOnNewContainer(CONSTANTS.managementContainerName, null, true, true, null, 'cluster stop ; cluster create', null);

        // Spin up management container.
        runOnNewContainer(CONSTANTS.managementContainerName, true, false, true, true, null, null, true, 'unless-stopped');

        // Bind the instance mesh network config together.
        executeOnContainer(CONSTANTS.managementContainerName, 'cluster bindmesh');
    }
}

function teardownDeploymentCluster() {
    if (isExists(CONSTANTS.managementContainerName)) {
        exec(`docker stop ${CONSTANTS.managementContainerName}`);
        exec(`docker rm ${CONSTANTS.managementContainerName}`);
    }
    runOnNewContainer(null, null, true, true, null, "cluster stop ; cluster destroy", null, false);
}

function updateDockerImages() {
    exec(`docker pull ${appenv.devkitImage}`);
    exec(`docker pull ${appenv.instanceImage}`, true);

    // Clear if there's already deployed cluster since they are outdated now.
    if (isExists(CONSTANTS.managementContainerName)) {
        info('\nCleaning the deployed contracts...');
        teardownDeploymentCluster();
    }
}

module.exports = {
    runOnNewContainer,
    executeOnContainer,
    executeOnManagementContainer,
    isExists,
    initializeDeploymentCluster,
    teardownDeploymentCluster,
    updateDockerImages,
    CONSTANTS
};