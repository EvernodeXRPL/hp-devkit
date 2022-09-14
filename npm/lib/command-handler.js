const fs = require('fs');
const appenv = require('../appenv');
const { exec } = require('./child-proc');
const { CONSTANTS, initializeDeploymentCluster, runOnContainer, executeOnContainer, teardownDeploymentCluster, isExists } = require('./common');
const { success, error, info, warn } = require('./logger');

function version() {
    info(`command: version`)

    exec(`npm list -g ${CONSTANTS.npmPackageName} --depth=0`, true)
}

function codeGen(platform, apptype, projName) {
    info("Code generator")

    if (fs.existsSync(projName)) {
        error(`Directory '${projName}' already exists.`)
        return -1
    }

    try {
        runOnContainer(CONSTANTS.codegenContainerName, null, null, null, null, `${platform} ${apptype} ${projName}`, 'codegen')
        exec(`docker cp ${CONSTANTS.codegenContainerName}:${CONSTANTS.codegenOutputDir} ./${projName}`, false, true);
        success(`Project '${projName}' created.`)
    }
    catch (e) {
        error(`Project '${projName}' generation failed.`)
        return -1
    }
    finally {
        exec(`docker rm ${CONSTANTS.codegenContainerName} &>/dev/null`)
    }
}

function deploy(contractPath) {
    info(`command: deploy (cluster: ${appenv.cluster})`)

    initializeDeploymentCluster();

    // If copying a directory, delete target bundle directory. If not create empty target bundle directory to copy a file.
    const prepareBundleDir = contractPath ?
        `rm -rf ${CONSTANTS.bundleMount}` :
        `mkdir -p ${CONSTANTS.bundleMount} && rm -rf ${CONSTANTS.bundleMount}/* ${CONSTANTS.bundleMount}/.??*`

    executeOnContainer(CONSTANTS.deploymentContainerName, prepareBundleDir)
    exec(`docker cp "${contractPath}" "${CONSTANTS.deploymentContainerName}:${CONSTANTS.bundleMount}"`)

    // Sync contract bundle to all instance directories in the cluster.
    executeOnContainer(CONSTANTS.deploymentContainerName, 'cluster stop ; cluster sync ; cluster start')

    if (appenv.defaultNode > 0) {
        info(`Streaming logs of node ${appenv.defaultNode}:`)
        executeOnContainer(CONSTANTS.deploymentContainerName, `cluster logs ${appenv.defaultNode}`)
    }
}

function clean() {
    info(`command: clean (cluster: ${appenv.cluster})`)

    teardownDeploymentCluster();
}

function logs(nodeNumber) {
    info(`command: logs (cluster: ${appenv.cluster})`)

    runOnContainer(null, null, true, true, null, `logs ${nodeNumber}`, 'cluster')
}

function start(nodeNumber) {
    info(`command: start (cluster: ${appenv.cluster})`)

    runOnContainer(null, null, true, true, null, `start ${nodeNumber}`, 'cluster');
}

function stop(nodeNumber) {
    info(`command: stop (cluster: ${appenv.cluster})`)

    runOnContainer(null, null, true, true, null, `stop ${nodeNumber}`, 'cluster')
}

function update() {
    info(`command: update`)

    exec(`npm update -g ${CONSTANTS.npmPackageName}`)

    info('Updating docker images...')
    exec(`docker pull ${appenv.devkitImage} &>/dev/null && docker pull ${appenv.instanceImage} &>/dev/null`)

    // Clear if there's already deployed cluster since they are outdated now.
    if (isExists(CONSTANTS.deploymentContainerName)) {
        info('Cleaning the deployed contracts...')
        teardownDeploymentCluster();
    }

    success('Update Completed !!')
    warn('NOTE: You need to re-deploy your contracts to make the new changes effective.')
}

function uninstall() {
    info(`command: uninstall`)

    // Remove deployment cluster if exist.
    if (isExists(CONSTANTS.deploymentContainerName)) {
        info('Cleaning the deployed contracts...')
        teardownDeploymentCluster();
    }

    // Remove docker images if exist.
    if (isExists(appenv.devkitImage, 'image')) {
        info('Removing devkit docker image...')
        exec(`docker image rm ${appenv.devkitImage} &>/dev/null`)
    }

    if (isExists(appenv.instanceImage, 'image')) {
        info('Removing instance docker image...')
        exec(`docker image rm ${appenv.instanceImage} &>/dev/null`)
    }

    exec(`npm uninstall -g ${CONSTANTS.npmPackageName}`)

    success('Uninstalled hpdevkit !!')
}

module.exports = {
    version,
    codeGen,
    deploy,
    clean,
    logs,
    start,
    stop,
    update,
    uninstall
}