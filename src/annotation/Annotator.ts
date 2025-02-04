import fs from 'fs'
import path from 'path'
import {
    Rosetta,
    RosettaLuaClass,
    RosettaLuaConstructor,
    RosettaLuaFunction,
} from 'pz-rosetta-ts'

import { BaseReporter } from '../base'
import { AnnotateArgs } from './types'
import {
    AnalyzedFunction,
    AnalyzedModule,
    AnalyzedParameter,
    Analyzer,
    LuaExpression,
    LuaLiteral,
    LuaOperation,
    TableField,
} from '../analysis'

const PREAMBLE = '---@meta\n'

/**
 * Handles annotation of Lua files.
 */
export class Annotator extends BaseReporter {
    protected outDirectory: string
    protected rosetta: Rosetta

    constructor(args: AnnotateArgs) {
        super(args)

        this.outDirectory = path.normalize(args.outputDirectory)
        this.rosetta = new Rosetta(args.rosetta)

        try {
            if (fs.existsSync(args.rosetta)) {
                this.rosetta.load()
            }
        } catch (e) {
            if (!this.suppressErrors) {
                console.error(`Failed to load rosetta: ${e}`)
            }
        }
    }

    generateStub(mod: AnalyzedModule) {
        const out = [PREAMBLE]

        if (this.writeLocals(mod, out)) {
            out.push('\n')
        }

        if (this.writeClasses(mod, out)) {
            out.push('\n')
        }

        if (this.writeGlobalFunctions(mod, out)) {
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
        const modules = await this.getModules()

        const outDir = this.outDirectory
        for (const mod of modules) {
            const outFile = path.resolve(path.join(outDir, mod.id + '.lua'))

            let typestub: string
            try {
                typestub = this.generateStub(mod)
            } catch (e) {
                this.errors.push(
                    `Failed to generate typestub for file ${outFile}: ${e}`,
                )

                continue
            }

            try {
                await this.outputFile(outFile, typestub)
            } catch (e) {
                this.errors.push(`Failed to write file ${outFile}: ${e}`)
            }
        }

        this.reportErrors()
        return modules
    }

    protected async getModules(): Promise<AnalyzedModule[]> {
        const analyzer = new Analyzer({
            inputDirectory: this.inDirectory,
            subdirectories: this.subdirectories,
            errors: this.errors,
            suppressErrors: true, // report errors at the end
        })

        return await analyzer.run()
    }

    protected getExpressionString(
        expression: LuaExpression,
        depth: number = 1,
    ): string {
        switch (expression.type) {
            case 'reference':
                return expression.id

            case 'require':
                return `require("${expression.module}")`

            case 'literal':
                return this.getLiteralString(expression, depth)

            case 'index':
                const indexBase = this.getExpressionString(expression.base)
                const index = this.getExpressionString(expression.index)

                return `${indexBase}[${index}]`

            case 'member':
                const memberBase = this.getExpressionString(expression.base)

                return `${memberBase}${expression.indexer}${expression.member}`

            case 'operation':
                return this.getOperationString(expression)
        }
    }

    protected getFunctionPrefix(
        parameters?: AnalyzedParameter[],
        returns?: Set<string>[],
        tabLevel: number = 0,
    ): string | undefined {
        const tabs = '    '.repeat(tabLevel)

        const out = []
        parameters ??= []
        for (const param of parameters) {
            let typeString = this.getTypeString(param.types)
            if (typeString === 'any') {
                continue
            }

            out.push('\n')
            out.push(tabs)
            out.push(`---@param ${param.name} ${typeString}`)
        }

        returns ??= []
        for (const ret of returns) {
            out.push('\n')
            out.push(tabs)
            out.push(`---@return ${this.getTypeString(ret)}`)
        }

        return out.join('')
    }

    protected getFunctionPrefixFromExpr(
        expression: LuaExpression,
        tabLevel: number = 0,
    ): string | undefined {
        if (expression.type !== 'literal') {
            return
        }

        if (expression.luaType !== 'function') {
            return
        }

        return this.getFunctionPrefix(
            expression.parameters,
            expression.returnTypes,
            tabLevel,
        )
    }

    protected getFunctionString(
        name: string | undefined,
        parameters: AnalyzedParameter[],
    ) {
        return this.getFunctionStringFromParamNames(
            name,
            parameters.map((x) => x.name),
        )
    }

    protected getFunctionStringFromParamNames(
        name: string | undefined,
        parameters: string[],
    ) {
        const params = parameters.join(', ')

        if (name) {
            return `function ${name}(${params}) end`
        }

        return `function(${params}) end`
    }

    protected getLiteralString(
        expression: LuaLiteral,
        depth: number = 1,
    ): string {
        switch (expression.luaType) {
            case 'nil':
                return 'nil'

            case 'string':
                return expression.literal ?? '""'

            case 'number':
                return expression.literal ?? '0'

            case 'boolean':
                return expression.literal ?? 'false'

            case 'function':
                return this.getFunctionString(
                    undefined,
                    expression.parameters ?? [],
                )

            case 'table':
                return this.getTableString(expression, depth) ?? '{}'
        }
    }

    protected getOperationString(expression: LuaOperation): string {
        let lhs = expression.arguments[0]
        let rhs = expression.arguments[1]

        switch (expression.operator) {
            case 'call':
                const callBase = this.getExpressionString(
                    expression.arguments[0],
                )

                const args: string[] = []
                for (let i = 1; i < expression.arguments.length; i++) {
                    args.push(this.getExpressionString(expression.arguments[i]))
                }

                return `${callBase}(${args.join(', ')})`

            default:
                let lhsString = this.getExpressionString(lhs)
                let rhsString = rhs ? this.getExpressionString(rhs) : undefined

                if (!this.includeAsIs(lhs)) {
                    lhsString = `(${lhsString})`
                }

                if (rhs && !this.includeAsIs(rhs)) {
                    rhsString = `(${rhsString})`
                }

                if (!rhsString) {
                    return `${expression.operator}${lhsString}`
                }

                return `${lhsString} ${expression.operator} ${rhsString}`
        }
    }

    protected getTableString(
        expression: LuaExpression,
        depth: number = 1,
    ): string | undefined {
        if (expression.type !== 'literal') {
            return
        }

        if (expression.luaType !== 'table') {
            return
        }

        const fields = expression.fields ?? []
        if (fields.length === 0) {
            return '{}'
        }

        const out: string[] = ['{']
        this.writeTableFields(fields, out, depth)

        out.push('\n')
        out.push('    '.repeat(Math.max(depth - 1, 0)))
        out.push('}')

        return out.join('')
    }

    protected getTypeString(types: Set<string>): string {
        types = new Set(types)
        if (types.size === 0) {
            return 'any'
        }

        const nullable = types.delete('nil')
        if (types.size === 0) {
            return 'any?'
        }

        const typeString = [...types].join(' | ')
        if (nullable) {
            return typeString.includes('|')
                ? `(${typeString})?`
                : `${typeString}?`
        }

        return typeString
    }

    protected includeAsIs(expr: LuaExpression): boolean {
        if (expr.type !== 'operation') {
            return true
        }

        switch (expr.operator) {
            case 'call':
            case '..':
            case '#':
                return true

            case '-':
                // unary minus as-is, binary minus with parentheses
                return expr.arguments.length === 1

            case 'or':
                // write ternary operators as-is
                const lhs = expr.arguments[0]
                return lhs?.type === 'operation' && lhs.operator === 'and'

            default:
                return false
        }
    }

    protected isLiteralTable(expr: LuaExpression): boolean {
        if (expr.type !== 'literal') {
            return false
        }

        return expr.luaType === 'table'
    }

    protected validateRosettaFunction(
        rosettaFunc: RosettaLuaFunction | RosettaLuaConstructor,
        func: AnalyzedFunction,
        isMethod: boolean,
    ) {
        const rosettaParamCount = rosettaFunc.parameters.length
        const luaParamCount = func.parameters.length
        const name = (rosettaFunc as any).name ?? func.name

        if (luaParamCount !== rosettaParamCount) {
            throw new Error(
                `Rosetta ${isMethod ? 'method' : 'function'}` +
                    ` '${name}' parameter count doesn't match.` +
                    ` (lua: ${luaParamCount}, rosetta: ${rosettaParamCount})`,
            )
        }
    }

    protected writeClasses(mod: AnalyzedModule, out: string[]): boolean {
        for (const cls of mod.classes) {
            const rosettaClass: RosettaLuaClass | undefined =
                this.rosetta.luaClasses[cls.name]

            const name = rosettaClass?.name ?? cls.name
            const base = rosettaClass?.extendz ?? cls.extends

            // class annotation
            if (out.length > 1) {
                out.push('\n')
            }

            if (rosettaClass?.deprecated) {
                out.push('\n---@deprecated')
            }

            if (rosettaClass?.notes) {
                out.push(`\n---${rosettaClass.notes}`)
            }

            out.push(`\n---@class ${name}`)
            if (base) {
                out.push(` : ${base}`)
            }

            const sortedFields = [...cls.fields].sort((a, b) =>
                a.name.localeCompare(b.name),
            )

            // fields
            const writtenFields = new Set<string>()
            for (const field of sortedFields) {
                const rosettaField = rosettaClass?.fields?.[field.name]

                const fieldName = rosettaField?.name ?? field.name
                writtenFields.add(fieldName)

                let typeString: string
                let notes: string
                if (rosettaField) {
                    typeString = rosettaField.type?.trim() ?? 'any'
                    notes = rosettaField.notes?.trim() ?? ''
                } else {
                    typeString = this.getTypeString(field.types)
                    notes = ''
                }

                if (notes) {
                    notes = ' ' + notes
                }

                out.push(`\n---@field ${fieldName} ${typeString}${notes}`)
            }

            // definition
            out.push('\n')

            if (cls.generated) {
                // generated classes aren't real globals
                out.push('local ')
            }

            out.push(`${name} = `)

            if (cls.deriveName && base) {
                out.push(`${base}:derive("${cls.deriveName}")`)
            } else if (cls.literalFields.length > 0) {
                out.push('{')

                this.writeTableFields(
                    cls.literalFields,
                    out,
                    undefined,
                    writtenFields,
                )

                out.push('\n}')
            } else {
                out.push('{}')
            }

            // inject static `Type` field for derived classes
            if (cls.deriveName) {
                const rosettaField = rosettaClass?.values.Type

                // skip if rosetta `Type` field is defined
                if (!rosettaField) {
                    out.push(`\n${name}.Type = "${cls.deriveName}"`)
                }
            }

            // static fields
            for (const field of cls.staticFields) {
                const rosettaField = rosettaClass?.values?.[field.name]
                const fieldName = rosettaField?.name ?? field.name

                if (writtenFields.has(fieldName)) {
                    continue
                }

                let typeString: string | undefined
                if (rosettaField) {
                    typeString = rosettaField.type?.trim()

                    const notes = rosettaField.notes?.trim()
                    if (notes) {
                        out.push('\n')
                        out.push(`\n---${notes}`)
                    }
                } else if (field.expression) {
                    const prefix = this.getFunctionPrefixFromExpr(
                        field.expression,
                    )

                    if (prefix) {
                        out.push('\n')
                        out.push(prefix)
                    }
                } else {
                    typeString = this.getTypeString(field.types)
                }

                out.push('\n')
                out.push(name)

                if (!fieldName.startsWith('[')) {
                    out.push('.')
                }

                const exprString = field.expression
                    ? this.getExpressionString(field.expression)
                    : 'nil'

                out.push(`${fieldName} = ${exprString}`)

                if (typeString) {
                    out.push(` ---@type ${typeString}`)
                }
            }

            // functions
            this.writeClassFunctions(
                name,
                cls.functions,
                '.',
                out,
                rosettaClass,
            )

            // methods
            this.writeClassFunctions(name, cls.methods, ':', out, rosettaClass)

            // function constructors
            this.writeClassFunctions(
                name,
                cls.functionConstructors,
                '.',
                out,
                rosettaClass,
            )

            // method constructors
            this.writeClassFunctions(
                name,
                cls.constructors,
                ':',
                out,
                rosettaClass,
            )
        }

        return mod.classes.length > 0
    }

    protected writeClassFunctions(
        name: string,
        functions: AnalyzedFunction[],
        indexer: string,
        out: string[],
        rosettaClass: RosettaLuaClass | undefined,
    ) {
        if (functions.length > 0) {
            out.push('\n')
        }

        const sortedFunctions = functions.sort((a, b) =>
            a.name.localeCompare(b.name),
        )

        const isMethod = indexer === ':'
        for (const func of sortedFunctions) {
            let rosettaFunc:
                | RosettaLuaFunction
                | RosettaLuaConstructor
                | undefined

            let funcName = func.name
            if (func.name === 'new') {
                rosettaFunc = rosettaClass?.conztructor
            } else if (rosettaClass) {
                rosettaFunc = isMethod
                    ? rosettaClass.methods[func.name]
                    : rosettaClass.functions[func.name]

                funcName = rosettaFunc?.name ?? funcName
            }

            const fullName = `${name}${indexer}${funcName}`
            if (rosettaFunc) {
                this.validateRosettaFunction(rosettaFunc, func, isMethod)
                this.writeRosettaFunction(rosettaFunc, fullName, out, func)
                return
            }

            const prefix = this.getFunctionPrefix(
                func.parameters,
                func.returnTypes,
            )

            out.push('\n')
            if (prefix) {
                out.push(prefix)
            }

            out.push('\n')
            out.push(this.getFunctionString(fullName, func.parameters))
        }
    }

    protected writeGlobalFunctions(
        mod: AnalyzedModule,
        out: string[],
    ): boolean {
        for (const func of mod.functions) {
            const rosettaFunc = this.rosetta.functions[func.name]
            if (rosettaFunc) {
                const funcName = rosettaFunc.name ?? func.name
                this.validateRosettaFunction(rosettaFunc, func, false)
                this.writeRosettaFunction(rosettaFunc, funcName, out, func)
                continue
            }

            const prefix = this.getFunctionPrefix(
                func.parameters,
                func.returnTypes,
            )

            if (prefix) {
                out.push('\n')
                out.push(prefix)
            }

            out.push('\n')
            out.push(this.getFunctionString(func.name, func.parameters))
        }

        return mod.functions.length > 0
    }

    protected writeLocals(mod: AnalyzedModule, out: string[]): boolean {
        for (const local of mod.locals) {
            let typeString: string | undefined
            const prefix = this.getFunctionPrefixFromExpr(local.expression)
            if (prefix) {
                out.push('\n')
                out.push(prefix)
            } else if (local.types) {
                typeString = this.getTypeString(local.types)
            }

            // write table type annotations on the line above
            if (typeString && this.isLiteralTable(local.expression)) {
                out.push(`\n---@type ${typeString}`)
                typeString = undefined
            }

            const rhs = this.getExpressionString(local.expression)
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

    protected writeReturns(mod: AnalyzedModule, out: string[]): boolean {
        if (mod.returns.length === 0) {
            return false
        }

        const locals: string[] = []
        const returns: string[] = []
        for (let i = 0; i < mod.returns.length; i++) {
            const ret = mod.returns[i]

            if (!ret.expression) {
                const typeString = this.getTypeString(ret.types)
                locals.push(`\nlocal __RETURN${i}__ ---@type ${typeString}`)
                returns.push(`__RETURN${i}__`)
            } else {
                returns.push(this.getExpressionString(ret.expression))
            }
        }

        locals.forEach((x) => out.push(x))

        out.push('\nreturn ')
        out.push(returns.join(', '))

        return true
    }

    protected writeRosettaFunction(
        rosettaFunc: RosettaLuaFunction | RosettaLuaConstructor,
        name: string,
        out: string[],
        func: AnalyzedFunction,
    ) {
        if ((rosettaFunc as any).deprecated) {
            out.push(`\n---@deprecated`)
        }

        if (rosettaFunc.notes) {
            out.push(`\n---${rosettaFunc.notes}`)
        }

        for (let i = 0; i < rosettaFunc.parameters.length; i++) {
            const param = rosettaFunc.parameters[i]
            out.push(`\n---@param ${param.name} ${param.type.trim()}`)
            if (param.notes) {
                out.push(` ${param.notes}`)
            }
        }

        const returns = (rosettaFunc as any).returns
        if (returns) {
            out.push(`\n---@return ${returns.type.trim()}`)
            if (returns.notes) {
                out.push(` #${returns.notes}`)
            }
        } else {
            for (const ret of func.returnTypes) {
                out.push(`\n---@return ${this.getTypeString(ret)}`)
            }
        }

        out.push('\n')
        out.push(
            this.getFunctionStringFromParamNames(
                name,
                rosettaFunc.parameters.map((x) => x.name),
            ),
        )
    }

    protected writeTableFields(
        fields: TableField[],
        out: string[],
        depth: number = 1,
        writtenFields?: Set<string>,
    ): Set<string> {
        writtenFields ??= new Set()
        const tab = '    '.repeat(depth)

        let nextAutoKey = 1
        for (const field of fields) {
            let skip = false

            let typeString: string | undefined
            if (field.types && field.types.size > 0) {
                typeString = this.getTypeString(field.types)
            }

            let funcString: string | undefined
            if (!typeString && field.value.type === 'literal') {
                funcString = this.getFunctionPrefixFromExpr(field.value, depth)
            }

            let keyString: string | undefined
            const key = field.key
            switch (key.type) {
                case 'string':
                    keyString = key.name
                    break

                case 'literal':
                    keyString = `[${key.literal}]`
                    if (key.name) {
                        skip = writtenFields.has(key.name)
                        writtenFields.add(key.name)
                    }

                    break

                case 'expression':
                    const exprString = this.getExpressionString(key.expression)
                    if (!exprString) {
                        skip = true
                        break
                    }

                    keyString = `[${exprString}]`
                    break
            }

            if (skip) {
                continue
            } else if (keyString) {
                if (writtenFields.has(keyString)) {
                    continue
                }

                writtenFields.add(keyString)
            } else {
                const autoKey = `[${nextAutoKey}]`
                nextAutoKey++

                if (writtenFields.has(autoKey)) {
                    continue
                }

                writtenFields.add(autoKey)
            }

            const valueString = typeString
                ? 'nil'
                : this.getExpressionString(field.value, depth + 1)

            if (typeString && this.isLiteralTable(field.value)) {
                if (out.length > 1) {
                    out.push('\n')
                }

                out.push('\n')
                out.push(tab)
                out.push(`---@type ${typeString}`)
                typeString = undefined
            } else if (funcString) {
                if (out.length > 1) {
                    out.push('\n')
                }

                out.push(funcString)
                typeString = undefined
            }

            out.push('\n')
            out.push(tab)

            if (keyString) {
                out.push(keyString)
                out.push(' = ')
            }

            out.push(valueString)
            out.push(',')

            if (typeString) {
                out.push(` ---@type ${typeString}`)
            }
        }

        return writtenFields
    }
}
