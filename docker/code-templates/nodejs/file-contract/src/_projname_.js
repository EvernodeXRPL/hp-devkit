const fs = require('fs').promises;

// This sample application writes and reads from a simple text file to serve user requests.
// Real-world applications may use a proper local database like sqlite.
const dataFile = 'datafile.txt'

export class _projname_ {
    sendOutput; // This function must be wired up by the caller.

    async handleRequest(user, msg, isReadOnly) {

        // This sample application defines simple file operations.
        // It's up to the application to decide the structure and contents of messages.

        if (msg.type == "upload") {
            // Check already exist.
            if (fs.existsSync(msg.fileName)) {
                await user.send(bson.serialize({
                    type: "uploadResult",
                    status: "already_exists",
                    fileName: msg.fileName
                }));
            }
            // Error is too large.
            else if (msg.content.length > 10 * 1024 * 1024) { // 10MB
                await user.send(bson.serialize({
                    type: "uploadResult",
                    status: "too_large",
                    fileName: msg.fileName
                }));
            }
            else {
                // Do not write in read only mode.
                if (!isReadOnly) {
                    // Save the file.
                    fs.writeFileSync(msg.fileName, msg.content.buffer);

                    await user.send(bson.serialize({
                        type: "uploadResult",
                        status: "ok",
                        fileName: msg.fileName
                    }));
                }
                else {
                    await this.sendOutput(user, {
                        type: "uploadResult",
                        status: "error",
                        error: 'Write is not supported in readonly mode'
                    })
                }

            }
        }
        else if (msg.type == "delete") {
            // Delete if exist.
            if (fs.existsSync(msg.fileName)) {
                // Do not delete in read only mode.
                if (!isReadOnly) {
                    fs.unlinkSync(msg.fileName);
                    await user.send(bson.serialize({
                        type: "deleteResult",
                        status: "ok",
                        fileName: msg.fileName
                    }));
                }
                else {
                    await this.sendOutput(user, {
                        type: "deleteResult",
                        status: "error",
                        error: 'Delete is not supported in readonly mode'
                    })
                }
            }
            else {
                await user.send(bson.serialize({
                    type: "deleteResult",
                    status: "not_found",
                    fileName: msg.fileName
                }));
            }
        }
        // Send file if exist.
        else if (msg.type == "download") {
            if (fs.existsSync(msg.fileName)) {
                const fileContent = fs.readFileSync(msg.fileName);
                await user.send(bson.serialize({
                    type: "downloadResult",
                    status: "ok",
                    fileName: msg.fileName,
                    content: fileContent
                }));
            }
            else {
                await user.send(bson.serialize({
                    type: "downloadResult",
                    status: "not_found",
                    fileName: msg.fileName
                }));
            }
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