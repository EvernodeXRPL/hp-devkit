#! /usr/bin/env node

const { program } = require('commander')
const { version, codeGen, deploy, clean, logs, start, stop, update, uninstall } = require('./lib/command-handler')

program
    .command('version')
    .description('hpdevkit version')
    .action(version)

program
    .command('gen <platform> <app-type> <project-name>')
    .description('hpdevkit gen <platform> <app-type> <project-name>')
    .action(codeGen)

program
    .command('deploy <contract-path>')
    .description('hpdevkit deploy <contract-path>')
    .action(deploy)

program
    .command('clean')
    .description('hpdevkit clean')
    .action(clean)

program
    .command('logs <node-number>')
    .description('hpdevkit logs <node-number>')
    .action(logs)

program
    .command('start <node-number>')
    .description('hpdevkit start <node-number>')
    .action(start)

program
    .command('stop <node-number>')
    .description('hpdevkit stop <node-number>')
    .action(stop)

program
    .command('update')
    .description('hpdevkit stop <node-number>')
    .action(update)

program
    .command('uninstall')
    .description('uninstall')
    .action(uninstall)

program.parse()