const fs = require('fs');
const path = require('path');
const appenv = require('../appenv');
const { exec } = require('./child-proc');
const {
    CONSTANTS,
    initializeDeploymentCluster,
    runOnContainer,
    executeOnContainer,
    teardownDeploymentCluster,
    isExists,
    updateDockerImages,
    archiveDirectory
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

    let containerStarted = false;
    try {
        runOnContainer(CONSTANTS.codegenContainerName, null, null, null, null, `${platform} ${apptype} ${projName}`, 'codegen');
        containerStarted = true;
        exec(`docker cp ${CONSTANTS.codegenContainerName}:${CONSTANTS.codegenOutputDir} ./${projName}`);
        success(`Project '${projName}' created.`);
    }
    catch (e) {
        error(`Project '${projName}' generation failed.`);
    }
    finally {
        if (containerStarted)
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

    executeOnContainer(CONSTANTS.deploymentContainerName, prepareBundleDir);
    exec(`docker cp ${contractPath} "${CONSTANTS.deploymentContainerName}:${CONSTANTS.bundleMount}"`);

    // Sync contract bundle to all instance directories in the cluster.
    executeOnContainer(CONSTANTS.deploymentContainerName, 'cluster stop ; cluster sync ; cluster start');

    if (appenv.defaultNode > 0) {
        info(`Streaming logs of node ${appenv.defaultNode}:`);
        executeOnContainer(CONSTANTS.deploymentContainerName, `cluster logs ${appenv.defaultNode}`);
    }
}

function bundle(nodePublicKey, contractDirectoryPath) {
    info(`command: bundle`);

    try {

        contractDirectoryPath = path.normalize(contractDirectoryPath);
        let stats = fs.statSync(contractDirectoryPath);

        if (!stats.isDirectory())
            throw 'You are supposed to provide a path of the contract directory.';

        const overrideConfigPath = path.resolve(contractDirectoryPath, CONSTANTS.confOverrideFile);
        const contractConfigPath = path.resolve(contractDirectoryPath, CONSTANTS.contractCfgFile);
        const prerequisiteInstaller = path.resolve(contractDirectoryPath, CONSTANTS.prerequisiteInstaller);
        const overrideConfig = JSON.parse(fs.readFileSync(overrideConfigPath).toString());

        const contractConfigs = {
            "version": "2.0",
            "unl": [
                `${nodePublicKey}`
            ],
            "bin_path": `${overrideConfig?.contract.bin_path}`,
            "bin_args": `${overrideConfig?.contract.bin_args}`,
            "environment": "",
            "max_input_ledger_offset": 10,
            "consensus": {
                "mode": "private",
                "roundtime": 8000,
                "stage_slice": 25,
                "threshold": 50
            },
            "npl": {
                "mode": "private"
            },
            "appbill": {
                "mode": "",
                "bin_args": ""
            },
            "round_limits": {
                "user_input_bytes": 0,
                "user_output_bytes": 0,
                "npl_output_bytes": 0,
                "proc_cpu_seconds": 0,
                "proc_mem_bytes": 0,
                "proc_ofd_count": 0
            }
        }

        // Write contract.cfg file content.
        fs.writeFileSync(contractConfigPath, JSON.stringify(contractConfigs, null, 4));
        info("Prepared contract.cfg file.");

        // Add prerequisite install script.
        fs.writeFileSync(prerequisiteInstaller,
            `#!/bin/bash\n
            echo "Prerequisite installer script"\n
            exit 0\n`);

        // Change permission  pre-requisite installer.
        fs.chmodSync(prerequisiteInstaller, 0o755);
        info("Added prerequisite installer script.");

        const bundleTargetPath = path.normalize(`${contractDirectoryPath}/../bundle`);

        if (!fs.existsSync(bundleTargetPath)) {
            fs.mkdirSync(bundleTargetPath);
        }

        archiveDirectory(contractDirectoryPath, bundleTargetPath);

    } catch (e) {
        error(e);
    }

}

function clean() {
    info(`command: clean (cluster: ${appenv.cluster})`);

    teardownDeploymentCluster();
}

function logs(nodeNumber) {
    info(`command: logs (cluster: ${appenv.cluster})`);

    runOnContainer(null, null, true, true, null, `logs ${nodeNumber}`, 'cluster');
}

function start(nodeNumber) {
    info(`command: start (cluster: ${appenv.cluster})`);

    runOnContainer(null, null, true, true, null, `start ${nodeNumber}`, 'cluster');
}

function stop(nodeNumber) {
    info(`command: stop (cluster: ${appenv.cluster})`);

    runOnContainer(null, null, true, true, null, `stop ${nodeNumber}`, 'cluster');
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
    if (isExists(CONSTANTS.deploymentContainerName)) {
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
    bundle,
    clean,
    logs,
    start,
    stop,
    update,
    uninstall
};