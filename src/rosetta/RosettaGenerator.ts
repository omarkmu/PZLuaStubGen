import path from 'path'
import YAML from 'yaml'
import { BaseAnnotator } from '../base'
import { AnalyzedModule } from '../analysis/types'
import {
    convertAnalyzedClass,
    convertAnalyzedFunctions,
    convertAnalyzedTable,
} from '../helpers'
import { RosettaGenerateArgs } from './types'
import { log } from '../logger'

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
        this.resetState()

        const modules = await this.getModules(true)

        const start = performance.now()
        const outDir = this.outDirectory

        const suffix = this.rosettaFormat === 'json' ? '.json' : '.yml'
        for (const mod of modules) {
            const outFile = path.resolve(
                path.join(outDir, this.rosettaFormat, mod.id + suffix),
            )

            let data: string
            try {
                data = this.generateRosetta(mod)
            } catch (e) {
                this.errors.push(
                    `Failed to generate Rosetta data for file '${outFile}': ${e}`,
                )

                continue
            }

            try {
                await this.outputFile(outFile, data)
            } catch (e) {
                this.errors.push(`Failed to write file '${outFile}': ${e}`)
            }
        }

        const time = (performance.now() - start).toFixed(0)
        log.verbose(`Finished Rosetta initialization in ${time}ms`)

        this.reportErrors()

        const resolvedOutDir = path.resolve(outDir)
        log.info(`Generated Rosetta data at '${resolvedOutDir}'`)

        return modules
    }
}
