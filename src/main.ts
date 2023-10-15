import fs from 'fs'
import path from 'path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { AnnotateArgs } from './types'
import { annotate } from './annotator'
import { parse } from './parser'

import { Rosetta } from 'pz-rosetta-ts/lib/asledgehammer/rosetta/Rosetta'

const annotateFiles = async (options: AnnotateArgs) => {

    const rosetta = new Rosetta()

    try {
        rosetta.load('assets/rosetta')
    } catch (e) {
        console.log(`Failed to load rosetta; creating fallback annotations. ${e}`)
    }

    // TODO: ultimately will be replaced with YAML definition
    const kahlua = fs.readFileSync(path.join(__dirname, 'kahlua.lua'))

    const inDir = path.resolve(options.in)
    const outDir = path.resolve(options.out)

    const errors = []

    const stack = [inDir]
    while (stack.length > 0) {
        const dirPath = stack.pop()!

        let dir: fs.Dir
        try {
            dir = await fs.promises.opendir(dirPath)
        } catch (e) {
            errors.push(`Failed to open directory: ${dirPath}`)
            continue
        }

        for await (const fileOrDirectory of dir) {
            const fullPath = path.join(dirPath, fileOrDirectory.name)
            if (fileOrDirectory.isDirectory()) {
                stack.push(fullPath)
                continue
            } else if (!fileOrDirectory.isFile() || path.extname(fullPath) !== '.lua') {
                continue
            }

            let content
            try {
                const file = await fs.promises.open(fullPath)
                content = await file.readFile('utf-8')
                await file.close()
            } catch (e) {
                errors.push(`Failed to read file: ${fullPath}`)
                continue
            }

            const parsed = parse(content)
            if (!parsed.success) {
                errors.push(`Failed to parse file: ${fullPath}`)
                continue
            }

            const annotated = annotate(rosetta, parsed.result, path.basename(fullPath, '.lua'), options)
            const outputPath = path.join(outDir, path.relative(inDir, fullPath))
            try {
                await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
                await fs.promises.writeFile(outputPath, annotated, { flag: 'w' })
            } catch (e) {
                errors.push(`Failed to create file: ${outputPath}`)
                continue
            }
        }
    }

    if (options['include-kahlua']) {
        const outputPath = path.join(outDir, '__kahlua.lua')

        try {
            await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
            await fs.promises.writeFile(outputPath, kahlua, { flag: 'w' })
        } catch (e) {
            errors.push(`Failed to create file: ${outputPath}`)
        }
    }

    for (const error of errors) {
        console.error(error)
    }
}

yargs(hideBin(process.argv))
    .version('0.0.0')
    .scriptName('pz-luadoc')
    .command('annotate', 'Annotate the files in a given directory',
        (yargs: yargs.Argv) => {
            return yargs
                .option('in', { type: 'string', alias: 'i', required: true })
                .option('out', { type: 'string', alias: 'o', required: true })
                .option('verbose', { type: 'boolean', alias: 'v' })
                .option('include-kahlua', { type: 'boolean', alias: 'k' })
                .option('strict-fields', { type: 'boolean' })
                .check(args => {
                    const inDir = path.resolve(args.in)
                    if (!fs.existsSync(inDir)) {
                        return 'Input directory does not exist.'
                    }

                    return true
                })
        },
        annotateFiles
    )
    .parseAsync()
    .catch(e => console.error(e))
