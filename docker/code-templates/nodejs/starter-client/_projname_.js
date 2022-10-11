const fs = require('fs');
const readline = require('readline');
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

    // Simple connection to single server without any validations.
    const ip = process.argv[2] || 'localhost';
    const port = process.argv[3] || '8081';
    const client = await HotPocket.createClient(
        ['wss://' + ip + ':' + port],
        userKeyPair
    );

    client.on(HotPocket.events.disconnect, () => {
        console.log('Disconnected');
        rl.close();
    })

    // This will get fired as servers connects/disconnects.
    client.on(HotPocket.events.connectionChange, (server, action) => {
        console.log(server + " " + action);
    })

    // This will get fired when contract sends outputs.
    client.on(HotPocket.events.contractOutput, (r) => {
        r.outputs.forEach(o => {
            if (o?.type == 'data_result') {
                console.log('\x1b[32m%s\x1b[0m', `Output >> ${o.data}`);
            } else if (o?.type == 'error') {
                console.log('\x1b[31m%s\x1b[0m', `Error >> ${o.error}`);
            }
        });
    })


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

    console.log('\x1b[36m%s\x1b[0m',"Run 'help' for more information on commands.");
    console.log("Ready to accept inputs.");

    const input_pump = () => {
        rl.question('', (inp) => {


            if (inp.length > 0) {
                if (inp.startsWith("help")) {
                    console.log('\x1b[36m%s\x1b[0m', `
    Commands :
    set <text>  -- To write some text to a file on the contract side.
    get         -- To retrieve the written content.
                    `);
                } else {
                    if (inp.startsWith("set ")) {
                        inp = JSON.stringify({ type: "set", data: inp.substr(4) });
                    }

                    else if (inp.startsWith("get")) {
                        inp = JSON.stringify({ type: "get" });
                    }

                    client.submitContractInput(inp).then(input => {
                        input.submissionStatus.then(s => {
                            if (s.status != "accepted")
                                console.log(s.reason);
                        });
                    });
                }

            }

            input_pump();
        })
    }
    input_pump();
}

clientApp();