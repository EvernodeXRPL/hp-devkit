const appenv = require("../appenv")
const { exec } = require("./child-proc")
const { info, log } = require("./logger")

const GLOBAL_PREFIX = "hpdevkit"
const VERSION = "0.1.0"

const CONSTANTS = {
    volumeMount: `/${GLOBAL_PREFIX}_vol`,
    volume: `${GLOBAL_PREFIX}_${appenv.cluster}_vol`,
    network: `${GLOBAL_PREFIX}_${appenv.cluster}_net`,
    containerPrefix: `${GLOBAL_PREFIX}_${appenv.cluster}_node`,
    bundleMount: `${GLOBAL_PREFIX}_vol/contract_bundle`,
    deploymentContainerName: `${GLOBAL_PREFIX}_${appenv.cluster}_deploymgr`,
    confOverrideFile: "hp.cfg.override",
    codegenOutputDir: "/codegen-output",
    codegenContainerName: `${GLOBAL_PREFIX}_codegen`
}

function runOnContainer(name, detached, autoRemove, mountStock, mountVolume, entryCmd, entryPoint) {
    command = `docker run -it`
    if (name)
        command += ` --name ${name}`

    if (detached)
        command += " -d"

    if (autoRemove)
        command += " --rm"

    if (mountStock)
        command += " --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock"

    if (mountVolume)
        command += ` --mount type=volume,src=${CONSTANTS.volume},dst=${CONSTANTS.volumeMount}`

    if (entryPoint)
        command += ` --entrypoint ${entryPoint}`
    else
        command += " --entrypoint /bin/bash"

    command += ` -e CLUSTER=${appenv.cluster} -e CLUSTER_SIZE=${appenv.clusterSize} -e DEFAULT_NODE=${appenv.defaultNode} -e VOLUME=${CONSTANTS.volume} -e NETWORK=${CONSTANTS.network}`
    command += ` -e CONTAINER_PREFIX=${CONSTANTS.containerPrefix} -e VOLUME_MOUNT=${CONSTANTS.volumeMount} -e BUNDLE_MOUNT=${CONSTANTS.bundleMount} -e HOTPOCKET_IMAGE=${appenv.instanceImage}`
    command += ` -e CONFIG_OVERRIDES_FILE=${CONSTANTS.confOverrideFile} -e CODEGEN_OUTPUT=${CONSTANTS.codegenOutputDir}`
    command += ` -e HP_USER_PORT_BEGIN=${appenv.hpUserPortBegin} -e HP_PEER_PORT_BEGIN=${appenv.hpPeerPortBegin}`

    command += ` ${appenv.devkitImage}`

    if (entryCmd) {
        if (entryPoint)
            command += ` ${entryCmd}`
        else
            command += ` -c '${entryCmd}'`
    }

    exec(command, true);
}

function executeOnContainer(name, cmd) {
    if (name)
        exec(`docker exec ${name}  /bin/bash -c '${cmd}'`, true)
}

function initializeDeploymentCluster() {
    const res = exec(`docker inspect ${CONSTANTS.deploymentContainerName} &>/dev/null`)
    const resJson = JSON.parse(res.toString())
    if (!resJson || !resJson.length) {
        log("Initializing deployment cluster")

        // Stop cluster if running. Create cluster if not exists.
        runOnContainer(CONSTANTS.deploymentContainerName, null, true, true, null, 'cluster stop ; cluster create', null)

        // Spin up management container.
        runOnContainer(CONSTANTS.deploymentContainerName, true, false, true, true, null, null)

        // Bind the instance mesh network config together.
        executeOnContainer(CONSTANTS.deploymentContainerName, 'cluster bindmesh')
    }
}

function teardownDeploymentCluster() {
    exec(`docker stop ${CONSTANTS.deploymentContainerName} 2>/dev/null`)
    exec(`docker rm ${CONSTANTS.deploymentContainerName} 2>/dev/null`)
    runOnContainer(null, null, true, true, null, "cluster stop ; cluster destroy", null)
}

module.exports = {
    runOnContainer,
    executeOnContainer,
    initializeDeploymentCluster,
    teardownDeploymentCluster,
    CONSTANTS
}