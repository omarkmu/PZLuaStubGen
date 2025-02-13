import path from 'path'
import YAML from 'yaml'
import { log } from '../logger'
import { BaseAnnotator } from '../base'
import { AnalyzedModule } from '../analysis/types'
import { RosettaGenerateArgs } from './types'
import {
    convertAnalyzedClass,
    convertAnalyzedFields,
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
        const rosettaFile = this.rosetta.files[mod.id]

        const classes: Record<string, any> = {}
        for (const cls of mod.classes) {
            const converted: any = convertAnalyzedClass(
                cls,
                rosettaFile?.classes[cls.name],
            )

            delete converted.name
            classes[cls.name] = converted
        }

        const tables: Record<string, any> = {}
        for (const table of mod.tables) {
            const converted: any = convertAnalyzedTable(
                table,
                rosettaFile?.tables[table.name],
            )

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
            luaData.functions = convertAnalyzedFunctions(
                mod.functions,
                rosettaFile?.functions,
            )
        }

        if (mod.fields.length > 0) {
            luaData.fields = convertAnalyzedFields(
                mod.fields,
                rosettaFile?.fields,
            )
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
        await this.writeModules(modules)

        const resolvedOutDir = path.resolve(this.outDirectory)
        log.info(`Generated Rosetta data at '${resolvedOutDir}'`)

        return modules
    }

    protected async writeModules(
        modules: AnalyzedModule[],
        taskName = 'Rosetta initialization',
    ) {
        await time(taskName, async () => {
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
    }
}
