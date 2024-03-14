const fs = require('fs');
const bson = require('bson');
const child_process = require('child_process');

const BUNDLE = "bundle.zip";
const HP_CFG_OVERRIDE = "hp.cfg.override";
const CONTRACT_CFG = "contract.config";
const INSTALL_SCRIPT = "install.sh"
const PATH_CFG = "../patch.cfg"
const BACKUP_PATH_CFG = "../patch.cfg.bk"
const HP_POST_EXEC_SCRIPT = "post_exec.sh";
const BACKUP = "backup";
const POST_EXEC_ERR_FILE = "post_exec.err"

export class _projname_ {
    sendOutput; // This function must be wired up by the caller.
    postExecErrors = {};

    // This function will be called in each contract execution.
    async handleContractExecution() {
        // Read and clear the error file.
        if (fs.existsSync(POST_EXEC_ERR_FILE)) {
            this.postExecErrors = fs.readFileSync(POST_EXEC_ERR_FILE);

            // Clear the file after reading.
            fs.rmSync(POST_EXEC_ERR_FILE);
        }
    }

    // This function will be called per each user.
    async handleUserExecution(user) {
        // Handle if there are errors for the user.
        if (this.postExecErrors[user.publicKey]) {
            if (this.postExecErrors[user.publicKey] !== "success") {
                console.error(`Found post execution errors!`);

                const error = this.postExecErrors[user.publicKey];
                delete this.postExecErrors[user.publicKey];

                await this.sendOutput(user, {
                    type: "upgradeResult",
                    status: "error",
                    error: error
                });
            }
        }
    }

    async #upgradeContract(bundleContent, user, ctx) {
        // Backup all the files first.
        const backup = `${BACKUP}-${ctx.timestamp}`
        child_process.execSync(`mkdir -p ../${backup} && cp -r ./* ../${backup}/ && mv ../${backup} ./${backup}`);

        console.log('Contract binaries backed up!');

        try {
            fs.writeFileSync(BUNDLE, bundleContent, { mode: 0o644 });

            // Install unzip if not exist.
            child_process.execSync(`/usr/bin/unzip -o ${BUNDLE} && rm -f ${BUNDLE}`);

            console.log('New contract binaries extracted!');

            let hpCfg = {};
            if (fs.existsSync(HP_CFG_OVERRIDE)) {
                hpCfg = JSON.parse(fs.readFileSync(HP_CFG_OVERRIDE).toString());
                child_process.execSync(`rm ${HP_CFG_OVERRIDE}`);
            }

            if (hpCfg.contract) {
                let contractCfg = {};
                if (fs.existsSync(CONTRACT_CFG)) {
                    contractCfg = JSON.parse(fs.readFileSync(CONTRACT_CFG).toString());
                }
                contractCfg = { ...contractCfg, ...hpCfg.contract };

                fs.writeFileSync(CONTRACT_CFG, JSON.stringify(contractCfg, null, 2), { mode: 0o644 });

                console.log('New contract configurations persisted!');
            }

            // mesh section. (only known_peers section handled currently)
            if (hpCfg.mesh?.known_peers) {
                if (hpCfg.mesh.known_peers.length > 0) {
                    ctx.updatePeers(hpCfg.mesh.known_peers);
                    console.log('Peer list updated!');
                }
            }

            const command = `#!/bin/bash

# Backup patch config.
cp ${PATH_CFG} ${BACKUP_PATH_CFG}

function print_err() {
    local error=$1
    log=$(jq . ${POST_EXEC_ERR_FILE})
    for key in $(jq -c 'keys[]' <<<$log); do
        log=$(jq ".$key = \"$error\"" <<<$log)
    done
    echo $log >${POST_EXEC_ERR_FILE}
}

function rollback() {
    # Restore patch.cfg if backup exists
    [ -f ${BACKUP_PATH_CFG} ] && mv ${BACKUP_PATH_CFG} ${PATH_CFG}
    return 0
}

function upgrade() {
    [ -f "${CONTRACT_CFG}" ] && jq -s '.[0] * .[1]' ${PATH_CFG} ${CONTRACT_CFG} > ../tmp.cfg && mv ../tmp.cfg ${PATH_CFG}

    if [ -f "${INSTALL_SCRIPT}" ]; then
        echo "${INSTALL_SCRIPT} found. Executing..."

        chmod +x ${INSTALL_SCRIPT}
        ./${INSTALL_SCRIPT}
        installcode=$?

        rm ${INSTALL_SCRIPT}

        if [ "$installcode" -eq "0" ]; then
            echo "${INSTALL_SCRIPT} executed successfully."
            return 0
        else
            echo "${INSTALL_SCRIPT} ended with exit code:$installcode"
            print_err "InstallScriptFailed"
            return 1
        fi
    fi
}

upgrade
upgradecode=$?

if [ "$upgradecode" -eq "0" ]; then
    # We have upgraded the contract successfully.
    echo "Upgrade successful."
else
    echo "Upgrade failed. Rolling back."
    rollback
fi

finalcode=$?
exit $finalcode`;

            // Create file to write post execution errors.
            this.postExecErrors[user.publicKey] = 'success';
            fs.writeFileSync(POST_EXEC_ERR_FILE, JSON.stringify(this.postExecErrors, null, 2), { mode: 0o644 });
            console.log('Generated error log file!');

            fs.writeFileSync(HP_POST_EXEC_SCRIPT, command, { mode: 0o777 });
            console.log('Generated post execution script!');

            await user.send(bson.serialize({
                type: "upgradeResult",
                status: "success"
            }));
        }
        catch (e) {
            console.error(e);

            child_process.execSync(`cp -r ${backup}/* ./ && rm -r ${backup}`);

            await user.send(bson.serialize({
                type: "upgradeResult",
                status: "error",
                error: e
            }));
        }
    }

    // This function will be called per each user input.
    async handleRequest(user, msg, isReadOnly, ctx) {
        // This sample application defines simple file operations.
        // It's up to the application to decide the structure and contents of messages.

        if (msg.type == "upgrade") {

            if (isReadOnly) {
                await this.sendOutput(user, {
                    type: "upgradeResult",
                    status: "error",
                    error: 'Contract upgrade is not supported in readonly mode'
                });

                return;
            }

            await this.#upgradeContract(msg.content.buffer, user, ctx);
        }
    }
}