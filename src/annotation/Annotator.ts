import path from 'path'
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

    constructor(args: AnnotateArgs) {
        super(args)

        this.outDirectory = path.normalize(args.outputDirectory)
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
            const typestub = this.generateStub(mod)

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

    protected writeClasses(mod: AnalyzedModule, out: string[]): boolean {
        for (const cls of mod.classes) {
            // annotation
            if (out.length > 1) {
                out.push('\n')
            }

            out.push(`\n---@class ${cls.name}`)
            if (cls.extends) {
                out.push(` : ${cls.extends}`)
            }

            // fields
            const instanceFields = new Set<string>()
            for (const field of cls.fields) {
                instanceFields.add(field.name)
                const typeString = this.getTypeString(field.types)
                out.push(`\n---@field ${field.name} ${typeString}`)
            }

            // definition
            out.push('\n')

            if (cls.generated) {
                out.push('local ')
            }

            out.push(`${cls.name} = `)

            if (cls.deriveName && cls.extends) {
                out.push(`${cls.extends}:derive("${cls.deriveName}")`)
            } else if (cls.literalFields.length > 0) {
                out.push('{')
                this.writeTableFields(cls.literalFields, out)
                out.push('\n}')
            } else {
                out.push('{}')
            }

            // inject static `Type` field for derived classes
            if (cls.deriveName) {
                out.push(`\n${cls.name}.Type = "${cls.deriveName}"`)
            }

            // static fields
            for (const field of cls.staticFields) {
                if (instanceFields.has(field.name)) {
                    continue
                }

                if (field.expression) {
                    const prefix = this.getFunctionPrefixFromExpr(
                        field.expression,
                    )

                    if (prefix) {
                        out.push('\n')
                        out.push(prefix)
                    }
                } else {
                    const typeString = this.getTypeString(field.types)
                    out.push(`\n---@type ${typeString}`)
                }

                out.push('\n')
                out.push(cls.name)

                if (!field.name.startsWith('[')) {
                    out.push('.')
                }

                const exprString = field.expression
                    ? this.getExpressionString(field.expression)
                    : 'nil'

                out.push(`${field.name} = ${exprString}`)
            }

            // functions
            this.writeClassFunctions(cls.name, cls.functions, '.', out)

            // methods
            this.writeClassFunctions(cls.name, cls.methods, ':', out)

            // function constructors
            this.writeClassFunctions(
                cls.name,
                cls.functionConstructors,
                '.',
                out,
            )

            // method constructors
            this.writeClassFunctions(cls.name, cls.constructors, ':', out)
        }

        return mod.classes.length > 0
    }

    protected writeClassFunctions(
        name: string,
        functions: AnalyzedFunction[],
        indexer: string,
        out: string[],
    ) {
        if (functions.length > 0) {
            out.push('\n')
        }

        for (const func of functions) {
            const prefix = this.getFunctionPrefix(
                func.parameters,
                func.returnTypes,
            )

            out.push('\n')
            if (prefix) {
                out.push(prefix)
            }

            out.push('\n')
            out.push(
                this.getFunctionString(
                    `${name}${indexer}${func.name}`,
                    func.parameters,
                ),
            )
        }
    }

    protected writeGlobalFunctions(
        mod: AnalyzedModule,
        out: string[],
    ): boolean {
        for (const func of mod.functions) {
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
            const prefix = this.getFunctionPrefixFromExpr(local.expression)
            if (prefix) {
                out.push('\n')
                out.push(prefix)
            } else if (local.types) {
                out.push(`\n---@type ${this.getTypeString(local.types)}`)
            }

            const rhs = this.getExpressionString(local.expression)
            if (rhs === 'nil') {
                out.push(`\nlocal ${local.name}`)
            } else {
                out.push(`\nlocal ${local.name} = `)
                out.push(rhs)
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
                locals.push(`\n---@type ${typeString}`)
                locals.push(`\nlocal __RETURN${i}__`)

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

    protected writeTableFields(
        fields: TableField[],
        out: string[],
        depth: number = 1,
    ) {
        const tab = '    '.repeat(depth)

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
                    break

                case 'expression':
                    const exprString = this.getExpressionString(key.expression)
                    if (!exprString) {
                        skip = true
                        break
                    }

                    keyString = exprString
                    break
            }

            if (skip) {
                continue
            }

            if (typeString) {
                if (out.length > 1) {
                    out.push('\n')
                }

                out.push('\n')
                out.push(tab)
                out.push(`---@type ${typeString}`)
            } else if (funcString) {
                if (out.length > 1) {
                    out.push('\n')
                }

                out.push(funcString)
            }

            out.push('\n')
            out.push(tab)

            if (keyString) {
                out.push(keyString)
                out.push(' = ')
            }

            if (typeString) {
                out.push('nil,')
                continue
            }

            const valueString = this.getExpressionString(field.value, depth + 1)

            out.push(valueString)
            out.push(',')
        }
    }
}
