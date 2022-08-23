const fs = require('fs').promises;

// This sample application writes and reads from a simple text file to serve user requests.
// Real-world applications may use a proper local database like sqlite.
const dataFile = 'datafile.txt'

export class _projname_ {
    sendOutput; // This function must be wired up by the caller.

    async handleRequest(user, message, isReadOnly) {

        // This sample application defines two simple messages. 'get' and 'set'.
        // It's up to the application to decide the structure and contents of messages.

        if (message.type == 'get') {

            // Retrieved previously saved data and return to the user.
            const data = await this.getData();
            await this.sendOutput(user, {
                type: 'data_result',
                data: data
            })
        }
        else if (message.type == 'set') {

            if (!isReadOnly) {
                // Save the provided data into storage.
                await this.setData(message.data);
            }
            else {
                await this.sendOutput(user, {
                    type: 'error',
                    error: 'Set data not supported in readonly mode'
                })
            }

        }
        else {
            await this.sendOutput(user, {
                type: 'error',
                error: 'Unknown message type'
            })
        }
    }

    async setData(data) {
        // HotPocket subjects data-on-disk to consensus.
        await fs.writeFile(dataFile, data);
    }

    async getData() {
        try {
            return (await fs.readFile(dataFile)).toString();
        }
        catch {
            console.log('Data file not created yet. Returning empty data.');
            return '';
        }
    }
}