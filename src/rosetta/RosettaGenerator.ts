import path from 'path'
import YAML from 'yaml'
import { log } from '../logger'
import { BaseAnnotator } from '../base'
import { AnalyzedModule } from '../analysis/types'
import { RosettaGenerateArgs } from './types'
import {
    convertAnalyzedClass,
    convertAnalyzedFunctions,
    convertAnalyzedTable,
    outputFile,
    time,
} from '../helpers'

const SCHEMA_URL =
    'https://raw.githubusercontent.com/asledgehammer/PZ-Rosetta-Schema/refs/heads/main/1.1.json'

export class RosettaGenerator extends BaseAnnotator {
    protected rosettaFormat: 'json' | 'yml'

    constructor(args: RosettaGenerateArgs) {
        super(args)

        this.rosettaFormat = args.format ?? 'yml'
    }

    generateRosetta(mod: AnalyzedModule): string {
        const classes: Record<string, any> = {}
        for (const cls of mod.classes) {
            const converted: any = convertAnalyzedClass(cls)
            delete converted.name
            classes[cls.name] = converted
        }

        const tables: Record<string, any> = {}
        for (const table of mod.tables) {
            const converted: any = convertAnalyzedTable(table)
            delete converted.name
            tables[table.name] = converted
        }

        const luaData: any = {}
        if (mod.tables.length > 0) {
            luaData.tables = tables
        }

        if (mod.classes.length > 0) {
            luaData.classes = classes
        }

        if (mod.functions.length > 0) {
            luaData.functions = convertAnalyzedFunctions(mod.functions)
        }

        const data: any = {}
        const format = this.rosettaFormat
        if (format === 'json') {
            data.$schema = SCHEMA_URL
        }

        data.version = '1.1'
        data.languages = { lua: luaData }

        let out: string
        if (format === 'json') {
            out = JSON.stringify(data, undefined, 2) + '\n'
        } else {
            const yml = YAML.stringify(data)

            out = `#yaml-language-server: $schema=${SCHEMA_URL}\n${yml}`
        }

        return out.replaceAll('\r', '')
    }

    async run() {
        const modules = await this.getModules(true)

        const outDir = this.outDirectory
        const suffix = this.rosettaFormat === 'json' ? '.json' : '.yml'

        await time('Rosetta initialization', async () => {
            for (const mod of modules) {
                const outFile = path.resolve(
                    path.join(outDir, this.rosettaFormat, mod.id + suffix),
                )

                let data: string
                try {
                    data = this.generateRosetta(mod)
                } catch (e) {
                    log.error(
                        `Failed to generate Rosetta data for file '${outFile}': ${e}`,
                    )

                    continue
                }

                try {
                    await outputFile(outFile, data)
                } catch (e) {
                    log.error(`Failed to write file '${outFile}': ${e}`)
                }
            }
        })

        const resolvedOutDir = path.resolve(outDir)
        log.info(`Generated Rosetta data at '${resolvedOutDir}'`)

        return modules
    }
}
