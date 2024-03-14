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
        if (output.type == "makePaymentResult") {
            if (output.status == "ok")
                console.log(`(ledger:${ledgerSeqNo})>> `, output.data);
            else
                console.log(`(ledger:${ledgerSeqNo})>> Upgrade failed. reason: `, output.error ?? output.status);
        }
        else {
            console.log("Unknown contract output.", output);
        }
    }

    console.log("Ready to accept inputs.");

    const input_pump = () => {
        rl.question('', async (inp) => {
            let input;
            if (inp.startsWith("makePayment ")) {
                const params = inp.split(' ');
                if (params.length == 3) {
                    input = await client.submitContractInput(JSON.stringify({
                        type: "makePayment",
                        sender: params[1],
                        receiver: params[2]
                    }));
                }
                else {
                    console.log("Invalid command. [makePayment <sender-address> <receiver-address>]");
                }
            }
            else {
                console.log("Invalid command. [makePayment <sender-address> <receiver-address>]");
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