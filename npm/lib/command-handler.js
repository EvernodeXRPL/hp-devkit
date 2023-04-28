const fs = require('fs');
const appenv = require('../appenv');
const { exec } = require('./child-proc');
const {
    CONSTANTS,
    initializeDeploymentCluster,
    runOnNewContainer,
    executeOnManagementContainer,
    teardownDeploymentCluster,
    isExists,
    updateDockerImages
} = require('./common');
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

function deploy(contractPath) {
    info(`command: deploy (cluster: ${appenv.cluster})`);

    initializeDeploymentCluster();

    // If copying a directory, delete target bundle directory. If not create empty target bundle directory to copy a file.
    const prepareBundleDir = contractPath ?
        `rm -rf ${CONSTANTS.bundleMount}` :
        `mkdir -p ${CONSTANTS.bundleMount} && rm -rf ${CONSTANTS.bundleMount}/* ${CONSTANTS.bundleMount}/.??*`;

    executeOnManagementContainer(prepareBundleDir);
    exec(`docker cp ${contractPath} "${CONSTANTS.managementContainerName}:${CONSTANTS.bundleMount}"`);

    // Sync contract bundle to all instance directories in the cluster.
    executeOnManagementContainer('cluster stop ; cluster sync ; cluster start');

    if (appenv.defaultNode > 0) {
        info(`Streaming logs of node ${appenv.defaultNode}:`);
        executeOnManagementContainer(`cluster logs ${appenv.defaultNode}`);
    }
}

function join() {
    info(`command: join (cluster: ${appenv.cluster})`);

    executeOnManagementContainer('cluster join && cluster logs 999999');
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
    codeGen,
    deploy,
    clean,
    logs,
    start,
    stop,
    join,
    update,
    uninstall
};