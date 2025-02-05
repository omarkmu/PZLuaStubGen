import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { ResolveArgs, Resolver } from './dependency-resolution'
import { AnalyzeArgs, Analyzer } from './analysis'
import { AnnotateArgs, Annotator } from './annotation'

/**
 * Adds the shared CLI options for report commands.
 */
const reportCommand = (yargs: yargs.Argv) => {
    return yargs
        .option('input-directory', {
            type: 'string',
            alias: 'i',
            required: true,
        })
        .option('out-file', {
            type: 'string',
            alias: 'o',
        })
        .option('subdirectories', {
            type: 'array',
            string: true,
            conflicts: ['all-subdirectories'],
        })
        .option('all-subdirectories', {
            type: 'boolean',
            conflicts: ['subdirectories'],
        })
        .check((args) => {
            if (!fs.existsSync(path.resolve(args['input-directory']))) {
                throw 'Input directory does not exist.'
            }

            return true
        })
}

/**
 * Adds the CLI options for the annotate command.
 */
const annotateCommand = (yargs: yargs.Argv) => {
    return yargs
        .option('input-directory', {
            type: 'string',
            alias: 'i',
            required: true,
        })
        .option('output-directory', {
            type: 'string',
            alias: 'o',
            required: true,
        })
        .option('subdirectories', {
            type: 'array',
            string: true,
            conflicts: ['all-subdirectories'],
        })
        .option('all-subdirectories', {
            type: 'boolean',
            conflicts: ['subdirectories'],
        })
        .option('rosetta', {
            type: 'string',
            default: 'assets/rosetta',
        })
        .check((args) => {
            if (!fs.existsSync(path.resolve(args['input-directory']))) {
                throw 'Input directory does not exist.'
            }

            return true
        })
}

yargs(hideBin(process.argv))
    .scriptName('pz-doc')
    .command(
        'report-deps',
        'Reports on requires, global reads/writes, and the resolved analysis order',
        reportCommand,
        async (args: ResolveArgs) => await new Resolver(args).generateReport(),
    )
    .command(
        'report-analysis',
        'Reports on analyzed and inferred Lua types',
        reportCommand,
        async (args: AnalyzeArgs) => await new Analyzer(args).generateReport(),
    )
    .command(
        'annotate',
        'Generates typestubs for Lua files',
        annotateCommand,
        (async (args: AnnotateArgs) => await new Annotator(args).run()) as any,
    )
    .demandCommand()
    .parseAsync()
    .catch((e) => console.error(e))
