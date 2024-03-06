export class _projname_ {
    sendOutput; // This function must be wired up by the caller.

    async handleRequest(user, message, unl, timeout, isReadOnly) {

        // This sample application defines a simple messages. 'rnd' and 'set'.
        // It's up to the application to decide the structure and contents of messages.

        if (message.type == 'rnd') {

            // NPL messages are not supported in readonly mode.
            if (!isReadOnly) {
                // Start listening to incoming NPL messages before we send ours.
                const promise = new Promise((resolve, reject) => {
                    let t = setTimeout(() => {
                        reject(`NPL messages aren't received withing ${timeout} ms.`);
                    }, timeout);

                    let nplRes = [];
                    unl.onMessage((node, msg) => {
                        nplRes.push({ pubkey: node.publicKey, number: msg });
                        // Resolve once all are received
                        if (nplRes.entries.length === unl.count()) {
                            clearTimeout(t);
                            resolve(nplRes.sort((a, b) => a.msg - b.msg));
                        }
                    });
                });

                await unl.send(Math.random());

                try {
                    const receipt = await promise;

                    await this.sendOutput(user, {
                        type: 'rndResult',
                        status: "ok",
                        nplMessages: receipt,
                        rnd: receipt[0].number
                    });
                }
                catch (e) {
                    await this.sendOutput(user, {
                        type: "rndResult",
                        status: "error",
                        error: e.toString()
                    });
                }
            }
            else {
                await this.sendOutput(user, {
                    type: "rndResult",
                    status: "error",
                    error: 'NPL messages are not supported in readonly mode'
                });
            }
        }
        else {
            await this.sendOutput(user, {
                type: 'error',
                error: 'Unknown message type'
            })
        }
    }
}