import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { ResolveArgs, Resolver } from './dependency-resolution'
import { AnalyzeArgs, Analyzer } from './analysis'
import { AnnotateArgs, Annotator } from './annotation'

/**
 * Adds shared yargs options to prefix for all commands.
 */
const sharedPrefix = (yargs: yargs.Argv) => {
    return yargs
        .option('level', {
            type: 'string',
            choices: ['error', 'warn', 'info', 'verbose', 'debug', 'silent'],
            conflicts: ['silent', 'verbose'],
        })
        .option('verbose', {
            type: 'boolean',
            alias: 'v',
            desc: 'Shortcut for verbose log level',
            conflicts: ['level', 'silent'],
        })
        .option('silent', {
            type: 'boolean',
            desc: 'Shortcut for silent log level',
            conflicts: ['level', 'verbose'],
        })
        .option('input-directory', {
            type: 'string',
            alias: 'i',
            required: true,
            desc: 'The directory for input Lua files',
        })
}

/**
 * Adds shared yargs options to suffix for all commands.
 */
const sharedSuffix = (yargs: yargs.Argv) => {
    return yargs
        .option('subdirectories', {
            type: 'array',
            string: true,
            conflicts: ['all-subdirectories'],
            defaultDescription: '"shared client server"',
            desc: 'The subdirectories to read',
        })
        .option('all-subdirectories', {
            type: 'boolean',
            conflicts: ['subdirectories'],
            desc: 'If given, all subdirectories of the input directory will be read',
        })
        .check((args: any) => {
            if (!fs.existsSync(path.resolve(args.inputDirectory))) {
                throw 'Input directory does not exist.'
            }

            return true
        })
        .wrap(120)
}

/**
 * Adds the CLI options for the annotate command.
 */
const annotateCommand = (yargs: yargs.Argv) => {
    return sharedSuffix(
        sharedPrefix(yargs)
            .option('output-directory', {
                type: 'string',
                alias: 'o',
                required: true,
                desc: 'The directory for output stubs',
            })
            .option('alphabetize', {
                type: 'boolean',
                default: true,
                desc: 'Whether fields and functions should be alphabetically sorted',
            })
            .option('include-kahlua', {
                type: 'boolean',
                alias: 'k',
                desc: 'Whether to generate the kahlua stub.',
            })
            .option('inject', {
                type: 'boolean',
                hidden: true,
                default: true,
            })
            .option('no-inject', {
                type: 'boolean',
                desc: 'Disallow injecting additional data from Rosetta',
            })
            .option('strict-fields', {
                type: 'boolean',
                hidden: true,
                default: true,
            })
            .option('no-strict-fields', {
                type: 'boolean',
                desc: 'Marks classes as accepting fields of any type',
            })
            .option('rosetta', {
                type: 'string',
                alias: 'r',
                desc: 'The directory to use for rosetta files',
            })
            .option('exclude', {
                type: 'array',
                alias: 'e',
                string: true,
                desc: 'Classes to exclude from annotations',
            })
            .option('exclude-fields', {
                type: 'array',
                string: true,
                desc: 'Classes to include without fields',
            })
            .option('exclude-known-defs', {
                type: 'boolean',
                default: true,
                desc: 'Whether known definition classes should be included without fields',
            }),
    )
}

/**
 * Adds the shared CLI options for report commands.
 */
const reportCommand = (yargs: yargs.Argv) => {
    return sharedSuffix(
        sharedPrefix(yargs).option('output-file', {
            type: 'string',
            alias: 'o',
            desc: 'The output file for report results',
        }),
    )
}

yargs(hideBin(process.argv))
    .scriptName('pz-lua-stubgen')
    .command(
        'annotate',
        'Generates typestubs for Lua files',
        annotateCommand,
        (async (args: AnnotateArgs) => await new Annotator(args).run()) as any,
    )
    .command(
        'report-analysis',
        'Reports on analyzed and inferred Lua types',
        reportCommand,
        (async (args: AnalyzeArgs) =>
            await new Analyzer(args).generateReport()) as any,
    )
    .command(
        'report-deps',
        'Reports on requires, global reads/writes, and the resolved analysis order',
        reportCommand,
        (async (args: ResolveArgs) =>
            await new Resolver(args).generateReport()) as any,
    )
    .strict()
    .demandCommand()
    .parseAsync()
    .catch((e) => console.error(e))
