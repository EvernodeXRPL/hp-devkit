const evp = require('everpocket-nodejs-contract');

export class _projname_ {
    sendOutput; // This function must be wired up by the caller.
    voteContext;
    hpContext;

    // This function will be called in each contract execution.
    async handleContractExecution(ctx) {
        this.voteContext = new evp.VoteContext(ctx);
        this.hpContext = new evp.HotPocketContext(ctx, { voteContext: this.voteContext });

        if (!ctx.readonly) {
            // Listen to incoming unl messages and feed them to elector.
            ctx.unl.onMessage((node, msg) => {
                this.voteContext.feedUnlMessage(node, msg);
            });
        }
    }

    async handleRequest(user, message, isReadOnly) {
        // This sample application defines two simple messages. 'get' and 'set'.
        // It's up to the application to decide the structure and contents of messages.

        if (message.type == 'makePayment') {
            if (isReadOnly) {
                await this.sendOutput(user, {
                    type: 'makePaymentResult',
                    status: 'error',
                    error: 'Submit multisig not supported in readonly mode'
                })

                return;
            }


            const sender = message.sender;
            const receiver = message.receiver;

            try {
                const xrplContext = new evp.XrplContext(this.hpContext, sender);
                await xrplContext.init();
                const tx = await xrplContext.xrplAcc.prepareMakePayment(receiver, "1", "XRP")

                console.log("----------- Multi-Signing Transaction");
                const res = await xrplContext.multiSignAndSubmitTransaction(tx);
                console.log("Transaction submitted");

                await this.sendOutput(user, {
                    type: 'makePaymentResult',
                    status: 'ok',
                    data: res
                })
            }
            catch (e) {
                console.error(e);

                await this.sendOutput(user, {
                    type: 'makePaymentResult',
                    status: 'error',
                    error: e
                })
            }
        }
        else {
            await this.sendOutput(user, {
                status: 'error',
                error: 'Unknown message type'
            })
        }
    }
}