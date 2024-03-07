const readline = require('readline');
const HotPocket = require('hotpocket-js-client');

async function clientApp() {

    const userKeyPair = await HotPocket.generateKeys();
    const client = await HotPocket.createClient(['wss://localhost:8081'], userKeyPair);

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
        if (output.type == "dataResult") {
            console.log(`(ledger:${ledgerSeqNo})>> ${output.data}`);
        }
        else if (output.type == "error") {
            console.log(`(ledger:${ledgerSeqNo})>> Error: ${output.error}`);
        }
        else {
            console.log("Unknown contract output.");
        }
    }

    console.log("Ready to accept inputs.");

    const input_pump = () => {
        rl.question('', async (inp) => {
            let input;
            if (inp.startsWith("set ")) {

                input = await client.submitContractInput(JSON.stringify({
                    type: "set",
                    data: inp.substr(4)
                }));
            }
            else if (inp.startsWith("get")) {

                // Read only inputs can be sent as read requests, So it'll be quick.
                const output = await client.submitContractReadRequest(JSON.stringify({
                    type: "get"
                }));

                handleOutput(output, (await client.getStatus()).ledgerSeqNo);
            }
            else {
                console.log("Invalid command. [set <data>] or [get] expected.")
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