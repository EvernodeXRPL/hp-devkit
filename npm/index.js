#! /usr/bin/env node

const { program } = require('commander');
const commands = require('./lib/commands');

program
    .command('version')
    .description('Display the hpdevkit version.')
    .action(commands.version);

program
    .command('list [platform]')
    .description('Lists existing templates in the specified platform. Lists all templates in the all platforms if unspecified.')
    .action(commands.list);

program
    .command('gen <platform> <app-type> <project-name>')
    .description('Generate HotPocket application development projects.')
    .action(commands.codeGen);

program
    .command('deploy <contract-path>')
    .description('Deploy the specified directory to a HotPocket cluster.')
    .action(commands.deploy);

program
    .command('clean')
    .description('Destroy the HotPocket cluster.')
    .action(commands.clean);

program
    .command('logs <node-number>')
    .description('Display logs of the specified node.')
    .action(commands.logs);

program
    .command('start [node-number]')
    .description('Start the specified node. Starts all nodes if unspecified.')
    .action(commands.start);

program
    .command('stop [node-number]')
    .description('Stop the specified node. Stops all nodes if unspecified.')
    .action(commands.stop);

program
    .command('spawn')
    .description('Create a fresh node which connects to the existing cluster.')
    .action(commands.spawn);

program
    .command('status')
    .description('Display status of running nodes.')
    .action(commands.status);

program
    .command('update')
    .description('Update hpdevkit.')
    .action(commands.update);

program
    .command('uninstall')
    .description('Uninstall hpdevkit.')
    .action(commands.uninstall);

try {
    program.parse();
}
catch (e) {
    // Console outputs will be handled inside command functions.
    // Log the exception if not a console output.
    if (!('stdout' in e) && !('stderr' in e))
        console.error(e);
}