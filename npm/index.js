#! /usr/bin/env node

const { program } = require('commander');
const { version, codeGen, bundle, deploy, clean, logs, start, stop, update, uninstall } = require('./lib/command-handler');

program
    .command('bundle <node-public-key> <contract-path>')
    .description('hpdevkit bundle <node-public-key> <contract-path>')
    .action(bundle);

program
    .command('version')
    .description('hpdevkit version')
    .action(version);

program
    .command('gen <platform> <app-type> <project-name>')
    .description('hpdevkit gen <platform> <app-type> <project-name>')
    .action(codeGen);

program
    .command('deploy <contract-path>')
    .description('hpdevkit deploy <contract-path>')
    .action(deploy);

program
    .command('clean')
    .description('hpdevkit clean')
    .action(clean);

program
    .command('logs <node-number>')
    .description('hpdevkit logs <node-number>')
    .action(logs);

program
    .command('start <node-number>')
    .description('hpdevkit start <node-number>')
    .action(start);

program
    .command('stop <node-number>')
    .description('hpdevkit stop <node-number>')
    .action(stop);

program
    .command('update')
    .description('hpdevkit update')
    .action(update);

program
    .command('uninstall')
    .description('uninstall')
    .action(uninstall);

try {
    program.parse();
}
catch (e) {
    // Console outputs will be handled inside command functions.
    // Log the exception if not a console output.
    if (!('stdout' in e) && !('stderr' in e))
        console.error(e);
}