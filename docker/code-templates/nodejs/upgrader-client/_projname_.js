const fs = require('fs');
const readline = require('readline');
const bson = require('bson');
const path = require("path");
const HotPocket = require('hotpocket-js-client');

async function clientApp() {

    const keyFile = 'user.key';

    // Re-generate a user key pair for the client.
    if (process.argv[2] == 'generatekeys' || !fs.existsSync(keyFile)) {
        const newKeyPair = await HotPocket.generateKeys();
        const saveData = Buffer.from(newKeyPair.privateKey).toString('hex');
        fs.writeFileSync(keyFile, saveData);
        console.log('New key pair generated.');

        if (process.argv[2] == 'generatekeys') {
            const pkhex = Buffer.from(newKeyPair.publicKey).toString('hex');
            console.log('My public key is: ' + pkhex);
            return;
        }
    }

    // Generate the key pair using saved private key data.
    const savedPrivateKeyHex = fs.readFileSync(keyFile).toString();
    const userKeyPair = await HotPocket.generateKeys(savedPrivateKeyHex);

    const pkhex = Buffer.from(userKeyPair.publicKey).toString('hex');
    console.log('My public key is: ' + pkhex);

    const ip = process.argv[2] || 'localhost';
    const port = process.argv[3] || '8081';
    const client = await HotPocket.createClient(
        ['wss://' + ip + ':' + port],
        userKeyPair,
        { protocol: HotPocket.protocols.bson }
    );

    // Establish HotPocket connection.
    if (!await client.connect()) {
        console.log('Connection failed.');
        return;
    }
    console.log('HotPocket Connected.');

    // start listening for stdin
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // On ctrl + c we should close HP connection gracefully.
    rl.on('SIGINT', () => {
        console.log('SIGINT received...');
        rl.close();
        client.close();
    });

    // This will get fired if HP server disconnects unexpectedly.
    client.on(HotPocket.events.disconnect, () => {
        console.log('Disconnected');
        rl.close();
    });

    // This will get fired when contract sends an output.
    client.on(HotPocket.events.contractOutput, (r) => {

        r.outputs.forEach(output => {
            handleOutput(output, r.ledgerSeqNo);
        });
    });

    const handleOutput = (output, ledgerSeqNo) => {
        // If bson.deserialize error occurred it'll be caught by this try catch.
        try {
            const result = bson.deserialize(output);
            if (result.type == "upgradeResult") {
                if (result.status == "ok")
                    console.log(`(ledger:${ledgerSeqNo})>> ${result.status}`);
                else
                    console.log(`(ledger:${ledgerSeqNo})>> Upgrade failed. reason: `, result.error ?? result.status);
            }
            else {
                console.log("Unknown contract output.");
            }
        }
        catch (e) {
            console.log(e)
        }
    }

    console.log("Ready to accept inputs.");

    const input_pump = () => {
        rl.question('', async (inp) => {
            let input;
            if (inp.startsWith("upgrade ")) {

                const filePath = inp.substr(8);
                const fileName = path.basename(filePath);
                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath);
                    const sizeKB = Math.round(fileContent.length / 1024);
                    console.log("Uploading file " + fileName + " (" + sizeKB + " KB)");

                    input = await client.submitContractInput(bson.serialize({
                        type: "upgrade",
                        content: fileContent
                    }));
                }
                else
                    console.log("File not found");
            }
            else {
                console.log("Invalid command. [upgrade <local path>] expected.")
            }

            if (input) {
                const submission = await input.submissionStatus;
                if (submission.status != "accepted")
                    console.log("Submission failed. reason: " + submission.reason);
            }

            input_pump();
        })
    }
    input_pump();
}

clientApp();