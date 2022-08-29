const fs = require('fs');
const appenv = require('../appenv');
const { exec } = require('./child-proc');
const { CONSTANTS, initializeDeploymentCluster, runOnContainer, executeOnContainer } = require('./common');
const { success, error, info } = require('./logger');

function codeGen(platform, apptype, projName) {
    info("Code generator")

    if (fs.existsSync(projName)) {
        error(`Directory '${projName}' already exists.`)
        return -1
    }

    try {
        runOnContainer(CONSTANTS.codegenContainerName, null, null, null, null, `${platform} ${apptype} ${projName}`, 'codegen')
        exec(`docker cp ${CONSTANTS.codegenContainerName}:${CONSTANTS.codegenOutputDir} ./${projName}`);
        success(`Project '${projName}' created.`)
        exec(`docker rm ${CONSTANTS.codegenContainerName} &>/dev/null`)
    }
    catch (e) {
        // console.log(e);
        error(`Project '${projName}' generation failed.`)
        return -1
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
    exec(`docker cp "${contractPath}" "${CONSTANTS.deploymentContainerName}:${CONSTANTS.bundleMount}`)

    // Sync contract bundle to all instance directories in the cluster.
    executeOnContainer(CONSTANTS.deploymentContainerName, 'cluster stop ; cluster sync ; cluster start')

    if (appenv.defaultNode > 0) {
        info("Streaming logs of node $defaultNode:")
        executeOnContainer(CONSTANTS.deploymentContainerName, `cluster logs ${appenv.defaultNode}`)
    }
}

module.exports = {
    codeGen,
    deploy
}