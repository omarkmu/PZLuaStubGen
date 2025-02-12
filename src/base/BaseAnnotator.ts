import path from 'path'
import { Analyzer } from '../analysis/Analyzer'
import { AnalyzedClass, AnalyzedModule } from '../analysis/types'
import { Rosetta } from '../rosetta/Rosetta'
import { RosettaFile } from '../rosetta/types'
import { BaseAnnotateArgs } from './types'
import { Base } from './Base'
import {
    convertRosettaClass,
    convertRosettaField,
    convertRosettaFields,
    convertRosettaFunction,
    convertRosettaFunctions,
    convertRosettaTable,
    readLuaStringLiteral,
} from '../helpers'

const DEFAULT_EXCLUDES = [
    'RecMedia',
    'Distributions',
    'ProceduralDistributions',
    'VehicleDistributions',
    'SuburbsDistributions',
    'ClutterTables',
    'BagsAndContainers',
    'SpecialLootSpawns',
]

export class BaseAnnotator extends Base {
    protected outDirectory: string
    protected rosetta: Rosetta
    protected useRosetta: boolean
    protected noInject: boolean
    protected rosettaOnly: boolean
    protected heuristics: boolean
    protected exclude: Set<string>
    protected excludeFields: Set<string>

    constructor(args: BaseAnnotateArgs) {
        super(args)

        this.outDirectory = path.normalize(args.outputDirectory)
        this.noInject = !(args.inject ?? true)
        this.exclude = new Set(args.exclude)
        this.excludeFields = new Set(args.excludeFields)
        this.rosettaOnly = args.rosettaOnly ?? false
        this.heuristics = args.heuristics ?? false

        if (args.excludeKnownDefs ?? !args.rosettaOnly) {
            DEFAULT_EXCLUDES.forEach((x) => this.excludeFields.add(x))
        }

        this.useRosetta = args.rosetta !== undefined
        this.rosetta = new Rosetta({
            inputDirectory: args.rosetta ?? '',
        })
    }

    protected augmentClass(
        cls: AnalyzedClass,
        rosettaFile: RosettaFile,
    ): AnalyzedClass {
        const rosettaClass = rosettaFile.classes[cls.name]
        if (!rosettaClass) {
            return cls
        }

        const fieldSet = new Set<string>(cls.fields.map((x) => x.name))
        cls.fields.push(
            ...convertRosettaFields(rosettaClass.fields ?? {}).filter(
                (x) => !fieldSet.has(x.name),
            ),
        )

        const staticFieldSet = new Set<string>(
            cls.staticFields.map((x) => x.name),
        )
        cls.setterFields.forEach((x) => staticFieldSet.add(x.name))

        cls.staticFields.push(
            ...convertRosettaFields(rosettaClass.staticFields ?? {}).filter(
                (x) => !staticFieldSet.has(x.name),
            ),
        )

        const funcSet = new Set<string>(cls.functions.map((x) => x.name))
        cls.functionConstructors.forEach((x) => funcSet.add(x.name))

        cls.functions.push(
            ...convertRosettaFunctions(rosettaClass.staticMethods ?? {}).filter(
                (x) => !funcSet.has(x.name),
            ),
        )

        const methodSet = new Set<string>(cls.methods.map((x) => x.name))
        cls.methods.push(
            ...convertRosettaFunctions(rosettaClass.methods ?? {}, true).filter(
                (x) => !methodSet.has(x.name),
            ),
        )

        // in rosetta-only mode, assume static `Type` field on subclass is derive name
        if (this.rosettaOnly && cls.extends) {
            const typeField = cls.staticFields.find((x) => x.name === 'Type')
            const typeValue =
                typeField?.expression?.type === 'literal' &&
                typeField.expression.literal
                    ? readLuaStringLiteral(typeField.expression.literal)
                    : undefined

            if (typeValue) {
                cls.deriveName = typeValue
            }
        }

        return cls
    }

    protected augmentModule(mod: AnalyzedModule): AnalyzedModule {
        const rosettaFile = this.rosetta.files[mod.id]
        if (!rosettaFile) {
            return mod
        }

        for (const cls of mod.classes) {
            this.augmentClass(cls, rosettaFile)
        }

        const clsSet = new Set<string>(mod.classes.map((x) => x.name))
        mod.classes.push(
            ...Object.values(rosettaFile.classes)
                .filter((x) => !clsSet.has(x.name))
                .map((x) => convertRosettaClass(x)),
        )

        const funcSet = new Set<string>(mod.functions.map((x) => x.name))
        mod.functions.push(
            ...Object.values(rosettaFile.functions)
                .filter((x) => !funcSet.has(x.name))
                .map((x) => convertRosettaFunction(x)),
        )

        const tableSet = new Set<string>(mod.tables.map((x) => x.name))
        mod.tables.push(
            ...Object.values(rosettaFile.tables)
                .filter((x) => !tableSet.has(x.name))
                .map(convertRosettaTable),
        )

        const fieldSet = new Set<string>(mod.fields.map((x) => x.name))
        mod.fields.push(
            ...Object.entries(rosettaFile.fields)
                .filter(([name]) => !fieldSet.has(name))
                .map(([name, x]) => convertRosettaField(x, name)),
        )

        return mod
    }

    protected createModule(file: RosettaFile): AnalyzedModule {
        const mod: AnalyzedModule = {
            id: file.id,
            classes: [],
            functions: [],
            tables: [],
            fields: [],
            returns: [],
        }

        return this.augmentModule(mod)
    }

    protected async getModules(
        isRosettaInit = false,
    ): Promise<AnalyzedModule[]> {
        let modules: AnalyzedModule[] = []

        if (!this.rosettaOnly) {
            const analyzer = new Analyzer({
                inputDirectory: this.inDirectory,
                subdirectories: this.subdirectories,
                isRosettaInit,
                heuristics: this.heuristics,
            })

            modules = await analyzer.run()
        }

        await this.transformModules(modules)
        return modules
    }

    protected async loadRosetta() {
        if (!this.useRosetta) {
            return
        }

        await this.rosetta.load()
    }

    protected async transformModules(modules: AnalyzedModule[]) {
        const idSet = new Set<string>(modules.map((x) => x.id))
        for (const [id, file] of Object.entries(this.rosetta.files)) {
            if (!idSet.has(id)) {
                modules.push(this.createModule(file))
            }
        }

        for (const mod of modules) {
            const rosettaFile = this.rosetta.files[mod.id]
            mod.classes = mod.classes.filter((x) => !this.exclude.has(x.name))

            for (const cls of mod.classes) {
                const rosettaClass = rosettaFile?.classes?.[cls.name]
                if (this.excludeFields.has(cls.name)) {
                    cls.fields = []
                    cls.literalFields = []
                    cls.setterFields = []
                    cls.staticFields = []
                    continue
                }

                let deriveName: string | undefined
                const rosettaType = rosettaClass?.staticFields?.Type
                if (cls.extends && rosettaType?.defaultValue) {
                    // use rosetta field if defined & valid string literal
                    deriveName = readLuaStringLiteral(rosettaType.defaultValue)
                } else {
                    // inject static `Type` field for derived classes
                    deriveName = cls.deriveName
                }

                if (deriveName) {
                    cls.staticFields.unshift({
                        name: 'Type',
                        types: new Set(),
                        expression: {
                            type: 'literal',
                            luaType: 'string',
                            literal: `"${deriveName}"`,
                        },
                    })
                }
            }
        }

        if (this.rosettaOnly || !this.noInject) {
            for (const mod of modules) {
                this.augmentModule(mod)
            }
        }
    }
}
