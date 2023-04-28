#! /usr/bin/env node

const { program } = require('commander');
const commands = require('./lib/commands');

program
    .command('version')
    .description('hpdevkit version')
    .action(commands.version);

program
    .command('gen <platform> <app-type> <project-name>')
    .description('hpdevkit gen <platform> <app-type> <project-name>')
    .action(commands.codeGen);

program
    .command('deploy <contract-path>')
    .description('hpdevkit deploy <contract-path>')
    .action(commands.deploy);

program
    .command('clean')
    .description('hpdevkit clean')
    .action(commands.clean);

program
    .command('logs <node-number>')
    .description('hpdevkit logs <node-number>')
    .action(commands.logs);

program
    .command('start [node-number]')
    .description('hpdevkit start [node-number]')
    .action(commands.start);

program
    .command('stop [node-number]')
    .description('hpdevkit stop [node-number]')
    .action(commands.stop);

program
    .command('join')
    .description('hpdevkit join')
    .action(commands.join);

program
    .command('status')
    .description('hpdevkit status')
    .action(commands.status);

program
    .command('update')
    .description('hpdevkit update')
    .action(commands.update);

program
    .command('uninstall')
    .description('uninstall')
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