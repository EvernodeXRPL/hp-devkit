#! /usr/bin/env node

const { program } = require('commander')
const { codeGen, deploy } = require('./lib/command-handler')

program
    .command('gen <platform> <app-type> <project-name>')
    .description('hpdevkit gen <platform> <app-type> <project-name>')
    .action(codeGen)

program
    .command('deploy <contract-path>')
    .description('hpdevkit deploy <contract-path>')
    .action(deploy)

program.parse()