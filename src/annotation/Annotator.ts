import path from 'path'
import YAML from 'yaml'
import { BaseReporter } from '../base'
import { AnnotateArgs } from './types'
import { log } from '../logger'

import {
    AnalyzedClass,
    AnalyzedField,
    AnalyzedFunction,
    AnalyzedModule,
    Analyzer,
} from '../analysis'

import {
    Rosetta,
    RosettaClass,
    RosettaConstructor,
    RosettaField,
    RosettaFile,
    RosettaFunction,
    RosettaOperator,
    RosettaOverload,
} from '../rosetta'

import {
    convertAnalyzedClass,
    convertAnalyzedFunctions,
    convertAnalyzedTable,
    convertRosettaClass,
    convertRosettaFields,
    convertRosettaFile,
    convertRosettaFunction,
    convertRosettaFunctions,
    convertRosettaTable,
    getExpressionString,
    getFunctionPrefix,
    getFunctionPrefixFromExpression,
    getFunctionString,
    getFunctionStringFromParamNames,
    getInlineNotes,
    getRosettaTypeString,
    getTypeString,
    getValueString,
    isLiteralTable,
    writeNotes,
    writeTableFields,
} from '../helpers'

const PREFIX = '---@meta'
const SCHEMA_URL =
    'https://raw.githubusercontent.com/asledgehammer/PZ-Rosetta-Schema/refs/heads/main/1.1.json'

/**
 * Handles annotation of Lua files.
 */
export class Annotator extends BaseReporter {
    protected outDirectory: string
    protected rosetta: Rosetta
    protected useRosetta: boolean
    protected alphabetize: boolean
    protected includeKahlua: boolean
    protected strictFields: boolean
    protected noInject: boolean
    protected exclude: Set<string>
    protected excludeFields: Set<string>
    protected rosettaFormat: 'json' | 'yml'

    constructor(args: AnnotateArgs) {
        super(args)

        this.outDirectory = path.normalize(args.outputDirectory)
        this.alphabetize = args.alphabetize
        this.includeKahlua = args.includeKahlua
        this.strictFields = args.strictFields
        this.noInject = !args.inject
        this.exclude = new Set(args.exclude)

        this.useRosetta = args.rosetta !== undefined
        this.rosetta = new Rosetta({
            inputDirectory: args.rosetta ?? '',
        })

        const excludeFields = args.excludeFields ?? []
        if (args.excludeKnownDefs) {
            excludeFields.push(
                ...[
                    'RecMedia',
                    'Distributions',
                    'ProceduralDistributions',
                    'VehicleDistributions',
                    'SuburbsDistributions',
                    'ClutterTables',
                    'BagsAndContainers',
                    'SpecialLootSpawns',
                ],
            )
        }

        this.excludeFields = new Set(excludeFields)
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
            const yml = YAML.stringify(data, {
                aliasDuplicateObjects: false,
            })

            out = `#yaml-language-server: $schema=${SCHEMA_URL}\n${yml}`
        }

        return out.replaceAll('\r', '')
    }

    generateStub(mod: AnalyzedModule) {
        const out = [(mod.prefix ?? PREFIX) + '\n']

        const rosettaFile = this.rosetta.files[mod.id]

        if (this.writeRequires(mod, out, rosettaFile)) {
            out.push('\n')
        }

        if (this.writeLocals(mod, out)) {
            out.push('\n')
        }

        if (this.writeTables(mod, out, rosettaFile)) {
            out.push('\n')
        }

        if (this.writeClasses(mod, out, rosettaFile)) {
            out.push('\n')
        }

        if (this.writeGlobalFunctions(mod, out, rosettaFile)) {
            out.push('\n')
        }

        this.writeReturns(mod, out)

        return out.join('').trimEnd() + '\n'
    }

    /**
     * Runs typestub generation.
     */
    async run() {
        this.resetState()
        await this.loadRosetta()

        const modules = await this.getModules()

        const start = performance.now()
        const outDir = this.outDirectory

        for (const mod of modules) {
            const outFile = path.resolve(path.join(outDir, mod.id + '.lua'))

            let typestub: string
            try {
                typestub = this.generateStub(mod)
            } catch (e) {
                this.errors.push(
                    `Failed to generate typestub for file '${outFile}': ${e}`,
                )

                continue
            }

            try {
                await this.outputFile(outFile, typestub)
            } catch (e) {
                this.errors.push(`Failed to write file '${outFile}': ${e}`)
            }
        }

        const time = (performance.now() - start).toFixed(0)
        log.verbose(`Finished annotation in ${time}ms`)

        this.reportErrors()

        const resolvedOutDir = path.resolve(outDir)
        log.info(`Generated stubs at '${resolvedOutDir}'`)

        return modules
    }

    async runRosettaInitialization() {
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

        return mod
    }

    protected async getKahluaModule(): Promise<AnalyzedModule | undefined> {
        const kahluaDataPath = path.join(__dirname, '../../__kahlua.yml')
        const file = await this.rosetta.loadYamlFile(kahluaDataPath)
        if (!file) {
            this.errors.push(
                `Failed to load kahlua data from ${kahluaDataPath}`,
            )

            return
        }

        const mod = convertRosettaFile(file)
        mod.prefix = '---@meta _'

        // manually set `table.pairs = pairs`
        const tableCls = mod.tables.find((x) => x.name === 'table')
        if (tableCls) {
            tableCls.staticFields.push({
                name: 'pairs',
                types: new Set(['function']),
                expression: {
                    type: 'reference',
                    id: 'pairs',
                },
            })
        }

        return mod
    }

    protected async getModules(
        isRosettaInit = false,
    ): Promise<AnalyzedModule[]> {
        const analyzer = new Analyzer({
            inputDirectory: this.inDirectory,
            subdirectories: this.subdirectories,
            errors: this.errors,
            isRosettaInit,
            suppressErrors: true, // report errors at the end
        })

        const modules = await analyzer.run()
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

                // inject static `Type` field for derived classes
                // skip if rosetta `Type` field is defined
                if (cls.deriveName && !rosettaClass?.staticFields?.Type) {
                    cls.staticFields.unshift({
                        name: 'Type',
                        types: new Set(),
                        expression: {
                            type: 'literal',
                            luaType: 'string',
                            literal: `"${cls.deriveName}"`,
                        },
                    })
                }
            }
        }

        if (!this.noInject) {
            for (const mod of modules) {
                this.augmentModule(mod)
            }
        }

        if (!this.includeKahlua) {
            return modules
        }

        const mod = await this.getKahluaModule()
        if (mod) {
            modules.push(mod)
        }

        return modules
    }

    protected getSafeIdentifier(name: string, dunder = false) {
        name = name.replaceAll('.', '_')
        if (!dunder) {
            return name
        }

        const prefix = name.slice(0, 2)
        if (prefix.toUpperCase() !== prefix) {
            name = name.slice(0, 1).toLowerCase() + name.slice(1)
        }

        return '__' + name
    }

    protected async loadRosetta() {
        if (!this.useRosetta) {
            return
        }

        const rosettaDir = this.rosetta.inputDirectory
        log.verbose(`Loading Rosetta from '${rosettaDir}'`)

        if (await this.rosetta.load()) {
            log.verbose('Loaded Rosetta')
        } else {
            log.warn(`Failed to load Rosetta from '${rosettaDir}'`)
        }
    }

    protected validateRosettaFunction(
        rosettaFunc: RosettaFunction | RosettaConstructor,
        func: AnalyzedFunction,
        isMethod: boolean,
    ) {
        const rosettaParamCount = rosettaFunc.parameters?.length ?? 0
        const luaParamCount = func.parameters.length
        const name = (rosettaFunc as RosettaFunction).name ?? func.name

        if (luaParamCount !== rosettaParamCount) {
            throw new Error(
                `Rosetta ${isMethod ? 'method' : 'function'}` +
                    ` '${name}' parameter count doesn't match.` +
                    ` (lua: ${luaParamCount}, rosetta: ${rosettaParamCount})`,
            )
        }
    }

    protected writeClasses(
        mod: AnalyzedModule,
        out: string[],
        rosettaFile: RosettaFile | undefined,
    ): boolean {
        let writtenCount = 0
        for (const cls of mod.classes) {
            writtenCount++
            const rosettaClass = rosettaFile?.classes[cls.name]
            const tags = new Set(rosettaClass?.tags ?? [])
            const noInitializer = tags.has('NoInitializer')

            const identName = this.getSafeIdentifier(cls.name, cls.local)
            const base = rosettaClass?.extends ?? cls.extends

            const writtenFields = new Set<string>()

            if (out.length > 1) {
                out.push('\n\n')
            }

            // class annotation
            if (rosettaClass?.deprecated) {
                out.push('\n---@deprecated')
            }

            writeNotes(rosettaClass?.notes, out)

            out.push(`\n---@class ${cls.name}`)
            if (base) {
                out.push(` : ${base}`)
            }

            this.writeRosettaOperators(rosettaClass?.operators, out)

            if (!this.writeRosettaOverloads(rosettaClass?.overloads, out)) {
                for (const overload of cls.overloads) {
                    this.writeOverload(overload, out)
                }
            }

            const sortedFields = this.alphabetize
                ? [...cls.fields].sort((a, b) => a.name.localeCompare(b.name))
                : cls.fields

            // fields
            for (const field of sortedFields) {
                const rosettaField = rosettaClass?.fields?.[field.name]

                writtenFields.add(field.name)

                let typeString: string
                let notes: string
                if (rosettaField) {
                    typeString = getRosettaTypeString(
                        rosettaField.type,
                        rosettaField.nullable,
                    )

                    notes = rosettaField.notes ?? ''
                } else {
                    typeString = getTypeString(field.types)
                    notes = ''
                }

                if (notes) {
                    notes = ' ' + getInlineNotes(notes)
                }

                out.push(`\n---@field ${field.name} ${typeString}${notes}`)
            }

            if (rosettaClass?.mutable || !this.strictFields) {
                out.push('\n---@field [any] any')
            }

            if (!noInitializer) {
                // definition
                out.push('\n')

                if (cls.local) {
                    out.push('local ')
                }

                out.push(`${identName} = `)

                if (cls.deriveName && base) {
                    out.push(`${base}:derive("${cls.deriveName}")`)
                } else if (cls.literalFields.length > 0) {
                    out.push('{')

                    writeTableFields(
                        cls.literalFields,
                        out,
                        undefined,
                        writtenFields,
                        rosettaClass?.staticFields,
                    )

                    out.push('\n}')
                } else {
                    out.push('{}')
                }
            }

            // static fields
            const statics = [...cls.staticFields, ...cls.setterFields]
            for (const field of statics) {
                this.writeStaticField(
                    identName,
                    field,
                    rosettaClass?.staticFields?.[field.name],
                    writtenFields,
                    out,
                )
            }

            // functions
            this.writeClassFunctions(
                identName,
                cls.functions,
                '.',
                out,
                rosettaClass,
            )

            // methods
            this.writeClassFunctions(
                identName,
                cls.methods,
                ':',
                out,
                rosettaClass,
            )

            // function constructors
            this.writeClassFunctions(
                identName,
                cls.functionConstructors,
                '.',
                out,
                rosettaClass,
            )

            // method constructors
            this.writeClassFunctions(
                identName,
                cls.constructors,
                ':',
                out,
                rosettaClass,
            )
        }

        return writtenCount > 0
    }

    protected writeClassFunctions(
        name: string,
        functions: AnalyzedFunction[],
        indexer: string,
        out: string[],
        rosettaClass: RosettaClass | undefined,
    ) {
        const sortedFunctions = this.alphabetize
            ? functions.sort((a, b) => a.name.localeCompare(b.name))
            : functions

        const isMethod = indexer === ':'
        for (const func of sortedFunctions) {
            let rosettaFunc: RosettaFunction | RosettaConstructor | undefined

            let funcName = func.name
            if (isMethod && funcName === 'new') {
                rosettaFunc = rosettaClass?.constructors?.[0]
            } else if (rosettaClass) {
                rosettaFunc = isMethod
                    ? rosettaClass.methods?.[funcName]
                    : rosettaClass.staticMethods?.[funcName]
            }

            const fullName = `${name}${indexer}${funcName}`
            this.writeFunction(func, fullName, isMethod, out, rosettaFunc)
        }
    }

    protected writeFunction(
        func: AnalyzedFunction,
        name: string,
        isMethod: boolean,
        out: string[],
        rosettaFunc: RosettaFunction | RosettaConstructor | undefined,
    ) {
        if (out.length > 1) {
            out.push('\n')
        }

        if (rosettaFunc) {
            this.validateRosettaFunction(rosettaFunc, func, isMethod)
            this.writeRosettaFunction(rosettaFunc, name, out, func)
            return
        }

        const prefix = getFunctionPrefix(func.parameters, func.returnTypes)
        if (prefix) {
            out.push(prefix)
        }

        out.push('\n')
        out.push(getFunctionString(name, func.parameters))
    }

    protected writeGlobalFunctions(
        mod: AnalyzedModule,
        out: string[],
        rosettaFile: RosettaFile | undefined,
    ): boolean {
        for (const func of mod.functions) {
            const rosettaFunc = rosettaFile?.functions[func.name]
            this.writeFunction(func, func.name, false, out, rosettaFunc)
        }

        return mod.functions.length > 0
    }

    protected writeLocals(mod: AnalyzedModule, out: string[]): boolean {
        for (const local of mod.locals) {
            let typeString: string | undefined
            const prefix = getFunctionPrefixFromExpression(local.expression)

            if (out.length > 1) {
                out.push('\n')
            }

            if (prefix) {
                out.push(prefix)
            } else if (local.types) {
                typeString = getTypeString(local.types)
            }

            // write table type annotations on the line above
            if (typeString && isLiteralTable(local.expression)) {
                out.push(`\n---@type ${typeString}`)
                typeString = undefined
            }

            const rhs = getExpressionString(local.expression)
            if (rhs === 'nil') {
                out.push(`\nlocal ${local.name}`)
            } else {
                out.push(`\nlocal ${local.name} = ${rhs}`)
            }

            if (typeString) {
                out.push(` ---@type ${typeString}`)
            }
        }

        return mod.locals.length > 0
    }

    protected writeOverload(overload: AnalyzedFunction, out: string[]) {
        out.push('\n---@overload fun(')

        const params: string[] = []
        for (const param of overload.parameters) {
            params.push(`${param.name}: ${getTypeString(param.types)}`)
        }

        out.push(params.join())
        out.push(')')

        const returns: string[] = []
        for (const ret of overload.returnTypes) {
            returns.push(getTypeString(ret))
        }

        if (returns.length > 0) {
            out.push(': ')
            out.push(returns.join())
        }
    }

    protected writeRosettaOperators(
        operators: RosettaOperator[] | undefined,
        out: string[],
    ): boolean {
        if (operators === undefined) {
            return false
        }

        for (const op of operators) {
            if (!op.operation || !op.return) {
                continue
            }

            out.push(`\n---@operator ${op.operation}`)
            if (op.parameter) {
                out.push(`(${op.parameter})`)
            }

            out.push(`: ${op.return}`)
        }

        return true
    }

    protected writeRosettaOverloads(
        overloads: RosettaOverload[] | undefined,
        out: string[],
    ): boolean {
        if (overloads === undefined) {
            return false
        }

        for (const overload of overloads) {
            out.push('\n---@overload fun(')

            const params: string[] = []
            for (const param of overload.parameters ?? []) {
                params.push(`${param.name}: ${param.type}`)
            }

            out.push(params.join())
            out.push(')')

            const returns: string[] = []
            for (const ret of overload.return ?? []) {
                if (!ret.type) {
                    continue
                }

                returns.push(ret.type)
            }

            if (returns.length > 0) {
                out.push(': ')
                out.push(returns.join())
            }
        }

        return true
    }

    protected writeReturns(mod: AnalyzedModule, out: string[]): boolean {
        if (mod.returns.length === 0) {
            return false
        }

        const locals: string[] = []
        const returns: string[] = []
        for (let i = 0; i < mod.returns.length; i++) {
            const ret = mod.returns[i]

            if (!ret.expression) {
                const typeString = getTypeString(ret.types)
                locals.push(`\nlocal __RETURN${i}__ ---@type ${typeString}`)
                returns.push(`__RETURN${i}__`)
            } else {
                returns.push(getExpressionString(ret.expression))
            }
        }

        locals.forEach((x) => out.push(x))

        out.push('\nreturn ')
        out.push(returns.join(', '))

        return true
    }

    protected writeRequires(
        mod: AnalyzedModule,
        out: string[],
        rosettaFile: RosettaFile | undefined,
    ): boolean {
        if (mod.requires.length === 0) {
            return false
        }

        let count = 0
        for (const req of mod.requires) {
            const rosettaClass = rosettaFile?.classes[req.name]

            // skip global requires that have a rosetta class defined
            if (rosettaClass) {
                continue
            }

            if (out.length > 1) {
                out.push('\n')
            }

            out.push(`\n${req.name} = require("${req.module}")`)
            count++
        }

        return count > 0
    }

    protected writeRosettaFunction(
        rosettaFunc: RosettaFunction | RosettaConstructor,
        name: string,
        out: string[],
        func: AnalyzedFunction,
    ) {
        if ((rosettaFunc as RosettaFunction).deprecated) {
            out.push(`\n---@deprecated`)
        }

        writeNotes(rosettaFunc.notes, out)

        const params = rosettaFunc.parameters ?? []
        for (let i = 0; i < params.length; i++) {
            const param = params[i]
            if (
                !param.type &&
                !param.optional &&
                !param.nullable &&
                !param.notes
            ) {
                continue
            }

            const type = getRosettaTypeString(
                param.type,
                param.optional,
                param.nullable,
            )

            out.push(`\n---@param ${param.name.trim()} ${type}`)
            if (param.notes) {
                out.push(` ${getInlineNotes(param.notes)}`)
            }
        }

        const returns = (rosettaFunc as RosettaFunction).return
        if (returns) {
            for (const ret of returns) {
                if (!ret.type && ret.nullable === undefined) {
                    continue
                }

                const type = getRosettaTypeString(ret.type, ret.nullable)
                out.push(`\n---@return ${type}`)

                if (ret.name) {
                    out.push(` ${ret.name.trim()}`)
                }

                if (ret.notes) {
                    const prefix = ret.name ? '' : '#'
                    out.push(` ${prefix}${getInlineNotes(ret.notes)}`)
                }
            }
        } else {
            for (const ret of func.returnTypes) {
                out.push(`\n---@return ${getTypeString(ret)}`)
            }
        }

        this.writeRosettaOverloads(
            (rosettaFunc as RosettaFunction).overloads,
            out,
        )

        out.push('\n')
        out.push(
            getFunctionStringFromParamNames(
                name,
                params.map((x) => x.name),
            ),
        )
    }

    protected writeStaticField(
        name: string,
        field: AnalyzedField,
        rosettaField: RosettaField | undefined,
        writtenFields: Set<string>,
        out: string[],
    ) {
        if (writtenFields.has(field.name)) {
            return
        }

        writtenFields.add(field.name)

        if (rosettaField?.notes) {
            out.push('\n')
            writeNotes(rosettaField.notes, out)
        }

        let hasRosettaType = false
        let typeString: string | undefined
        if (rosettaField?.type || rosettaField?.nullable !== undefined) {
            typeString = getRosettaTypeString(
                rosettaField.type,
                rosettaField.nullable,
            )

            hasRosettaType = true
        } else if (field.expression) {
            const prefix = getFunctionPrefixFromExpression(field.expression)

            if (prefix) {
                out.push('\n')
                out.push(prefix)
            }
        } else {
            typeString = getTypeString(field.types)
        }

        out.push('\n')
        out.push(name)

        if (!field.name.startsWith('[')) {
            out.push('.')
        }

        let valueString: string
        ;[valueString, typeString] = getValueString(
            field.expression,
            rosettaField,
            typeString,
            hasRosettaType,
            false,
        )

        out.push(`${field.name} = ${valueString}`)

        if (typeString) {
            out.push(` ---@type ${typeString}`)
        }
    }

    protected writeTables(
        mod: AnalyzedModule,
        out: string[],
        rosettaFile: RosettaFile | undefined,
    ): boolean {
        let writtenCount = 0
        for (const table of mod.tables) {
            writtenCount++
            const rosettaTable = rosettaFile?.tables?.[table.name]
            const tags = new Set(rosettaTable?.tags ?? [])

            const identName = table.local
                ? this.getSafeIdentifier(table.name)
                : table.name

            if (!tags.has('NoInitializer')) {
                writeNotes(rosettaTable?.notes, out)
                this.writeRosettaOperators(rosettaTable?.operators, out)

                if (!this.writeRosettaOverloads(rosettaTable?.overloads, out)) {
                    for (const overload of table.overloads) {
                        this.writeOverload(overload, out)
                    }
                }

                if (out.length > 1) {
                    out.push('\n')
                }

                out.push('\n')
                if (table.local) {
                    out.push('local ')
                }

                out.push(identName)
                out.push(' = {}')
            } else if (out.length > 1) {
                out.push('\n\n')
            }

            const writtenFields = new Set<string>()
            for (const field of table.staticFields) {
                this.writeStaticField(
                    table.name,
                    field,
                    rosettaTable?.staticFields?.[field.name],
                    writtenFields,
                    out,
                )
            }

            for (const func of table.functions) {
                this.writeFunction(
                    func,
                    `${identName}.${func.name}`,
                    false,
                    out,
                    rosettaTable?.staticMethods?.[func.name],
                )
            }

            for (const func of table.methods) {
                this.writeFunction(
                    func,
                    `${identName}:${func.name}`,
                    false,
                    out,
                    rosettaTable?.staticMethods?.[func.name],
                )
            }
        }

        return writtenCount > 0
    }
}
