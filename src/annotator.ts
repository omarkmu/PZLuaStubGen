import ast from 'luaparse'
import { getParameterList } from './parser/utils'
import { LuaClass, LuaFunction, LuaSourceInfo } from './parser/types'
import { AnnotateArgs } from './types'

import { Rosetta, RosettaLuaFunction, RosettaLuaConstructor } from 'pz-rosetta-ts'

const PREAMBLE = '---@meta\n'
let rosetta: Rosetta

const includeAsIs = (expr: ast.Expression): boolean => {
    switch (expr.type) {
        case 'StringLiteral':
        case 'BooleanLiteral':
        case 'NilLiteral':
        case 'NumericLiteral':
        case 'Identifier':
        case 'TableConstructorExpression':
        case 'MemberExpression':
        case 'IndexExpression':
        case 'CallExpression':
        case 'TableCallExpression':
        case 'StringCallExpression':
            return true
        case 'BinaryExpression':
            return expr.operator === '..'
    }

    return false
}

const isTernary = (expr: ast.Expression): boolean => {
    if (expr.type !== 'LogicalExpression') return false
    if (expr.left.type !== 'LogicalExpression') return false
    if (expr.operator !== 'or') return false
    if (expr.left.operator !== 'and') return false
    return true
}

const rewriteCall = (base: ast.Expression, args: ast.Expression[]): string | undefined => {
    const rewrittenBase = rewriteExpression(base)
    if (!rewrittenBase) return

    const rewrittenArgs = []

    for (const arg of args) {
        const rewritten = rewriteExpression(arg)
        if (!rewritten) return

        rewrittenArgs.push(rewritten)
    }

    return `${rewrittenBase}(${rewrittenArgs.join(', ')})`
}

/**
 * Rewrites a Lua expression.
 * Function bodies are not preserved.
 */
const rewriteExpression = (expr?: ast.Expression, tabLevel = 1): string | undefined => {
    if (!expr) return

    switch (expr.type) {
        case 'StringLiteral':
        case 'BooleanLiteral':
        case 'NilLiteral':
        case 'NumericLiteral':
        case 'VarargLiteral':
            return expr.raw
        case 'FunctionDeclaration':
            return `function(${getParameterList(expr.parameters).join(', ')}) end`
        case 'UnaryExpression':
            const inner = rewriteExpression(expr.argument)
            if (!inner) return

            if (includeAsIs(expr.argument)) {
                return `-${inner}`
            }

            return `-(${inner})`
        case 'BinaryExpression':
        case 'LogicalExpression':
            const left = rewriteExpression(expr.left)
            if (!left) return

            const right = rewriteExpression(expr.right)
            if (!right) return

            const ternary = isTernary(expr)

            const out = []
            if (ternary || includeAsIs(expr.left)) {
                out.push(left)
            } else {
                out.push(`(${left})`)
            }

            out.push(' ')
            out.push(expr.operator)
            out.push(' ')

            if (ternary || includeAsIs(expr.right)) {
                out.push(right)
            } else {
                out.push(`(${right})`)
            }

            return out.join('')
        case 'TableConstructorExpression':
            return rewriteTable(expr, tabLevel)
        case 'CallExpression':
            return rewriteCall(expr.base, expr.arguments)
        case 'TableCallExpression':
            return rewriteCall(expr.base, [expr.arguments])
        case 'StringCallExpression':
            return rewriteCall(expr.base, [expr.argument])
        case 'Identifier':
            return expr.name
        case 'IndexExpression':
            const idxBase = rewriteExpression(expr.base)
            if (!idxBase) return

            const idx = rewriteExpression(expr.index)
            if (!idx) return

            return `${idxBase}[${idx}]`
        case 'MemberExpression':
            const base = rewriteExpression(expr.base)
            if (!base) return

            const ident = rewriteExpression(expr.identifier)
            if (!ident) return

            return `${base}${expr.indexer}${ident}`
    }
}

const rewriteTable = (init?: ast.TableConstructorExpression, tabLevel = 1) => {
    if (!init) return
    if (init.fields.length === 0) return '{}'

    const out: string[] = []

    for (const field of init.fields) {
        out.push('\n')
        out.push('    '.repeat(tabLevel))

        if (field.value.type === 'FunctionDeclaration') {
            out.push('---@return any')
            out.push('\n')
            out.push('    '.repeat(tabLevel))
        }

        if (field.type === 'TableKey') {
            const raw = rewriteExpression(field.key)
            if (!raw) {
                return
            }

            out.push('[')
            out.push(raw)
            out.push('] = ')
        } else if (field.type === 'TableKeyString') {
            out.push(field.key.name)
            out.push(' = ')
        }

        const value = rewriteExpression(field.value, tabLevel + 1)
        if (!value) {
            return
        }

        out.push(value)
        out.push(',')
    }

    if (out.length === 0) return

    out.push('\n')
    out.push('    '.repeat(tabLevel - 1))
    out.push('}')

    return '{' + out.join('')
}

const shouldSkipClassAnnotation = (cls: LuaClass, filename: string): boolean => {
    if (cls.noAnnotation) return true
    if (cls.name === filename) return false
    if (cls.base) return false
    if (cls.statics.length > 0) return false
    if (cls.functions.length > 0) return false
    if (cls.methods.length > 0) return false
    if (Object.values(cls.fields).length > 0) return false
    return true
}

const annotateMemberFunction = (
    cls: LuaClass,
    func: LuaFunction,
    returnType: string,
    isMethod: boolean,
    out: string[]
) => {
    let rosettaObj: RosettaLuaFunction | RosettaLuaConstructor | undefined
    const rosettaLuaClass = rosetta.luaClasses[cls.name]
    if (rosettaLuaClass != undefined) {
        if (func.name === 'new') {
            // @ts-ignore
            rosettaObj = rosettaLuaClass.conztructor
        } else {
            rosettaObj = isMethod ? rosettaLuaClass.methods[func.name] : rosettaLuaClass.functions[func.name]
        }
    }

    const index = isMethod ? ':' : '.'
    const name = `${cls.name}${index}${func.name}`

    out.push('\n')

    if (rosettaObj !== undefined) {
        let appliedFlags = false

        if (appliedFlags) {
            out.push('\n---')
        }

        const luaParamCount = func.parameters !== undefined ? func.parameters.length : 0
        const rosettaParamCount = rosettaObj.parameters !== undefined ? rosettaObj.parameters.length : 0

        if (
            func.parameters !== undefined &&
            rosettaObj.parameters !== undefined &&
            luaParamCount !== rosettaParamCount
        ) {
            throw new Error(
                'Rosetta\'s ' +
                    (isMethod ? 'method' : 'function') +
                    ` '${name}' parameter(s) doesn't match. (lua: ${luaParamCount}, rosetta: ${rosettaParamCount})`
            )
        }
        if (rosettaObj.notes != undefined && rosettaObj.notes.length !== 0) {
            out.push('\n--- ' + rosettaObj.notes)
        }
        if (rosettaParamCount !== 0) {
            out.push('\n---')
            for (let index = 0; index < rosettaParamCount; index++) {
                const param = rosettaObj.parameters[index]
                let s = `\n---@param ${param.name} ${param.type.trim()} ${
                    param.notes != undefined ? param.notes : ''
                }`
                out.push(s)
            }
        }

        out.push(`\n---`)

        const returns = (rosettaObj as any).returns
        if (returns != undefined) {
            out.push(`\n---@return ${returns.type.trim()}${returns.notes != undefined ? ` ${returns.notes}` : ''}`)
        } else {
            out.push(`\n---@return ${returnType}`)
        }

        if (rosettaObj.parameters != null) {
            out.push(`\nfunction ${name}(${rosettaObj.parameters.map((o) => o.name).join(', ')}) end`)
        } else {
            out.push(`\nfunction ${name}(${func.parameters.join(', ')}) end`)
        }
    } else {
        // Original rendering.
        out.push(`\n---@return ${returnType}`)
        out.push(`\nfunction ${name}(${func.parameters.join(', ')}) end`)
    }
}

const annotateFunctionGroup = (cls: LuaClass, functions: LuaFunction[], isMethod: boolean, out: string[]) => {
    if (functions.length === 0) return

    out.push('\n')

    let cons

    functions.sort((a, b) => a.name.localeCompare(b.name))

    for (const func of functions) {
        if (func.name === 'new') {
            // move constructor to bottom
            cons = func
            continue
        }

        annotateMemberFunction(cls, func, 'any', isMethod, out)
    }

    if (cons) {
        const returnType = cls.constructorType ?? (isMethod ? cls.name : undefined) ?? 'any'
        out.push('\n')
        annotateMemberFunction(cls, cons, returnType, isMethod, out)
    }
}

const annotateClass = (cls: LuaClass, filename: string, args: AnnotateArgs, out: string[]) => {
    const isSimple = shouldSkipClassAnnotation(cls, filename)

    const rosettaLuaClass = rosetta.luaClasses[cls.name]

    if (!isSimple) {
        if (rosettaLuaClass != undefined) {
            let appliedFlags = false
            if (rosettaLuaClass.deprecated) {
                out.push('\n---@deprecated')
                appliedFlags = true
            }
            if (appliedFlags) {
                out.push('\n---')
            }

            if (rosettaLuaClass.notes != undefined && rosettaLuaClass.notes.length !== 0) {
                out.push(`\n--- ${rosettaLuaClass.notes}`)
            }
        }
        out.push(`\n---@class ${cls.name}`)
    } else {
        out.push('\n')
    }

    let initializer: string | undefined
    if (cls.base && !cls.generated && !isSimple) {
        out.push(` : ${cls.base}`)
    } else if (!cls.generated) {
        initializer = rewriteExpression(cls.init)
    }

    let keys = Object.keys(cls.fields)
    keys.sort((a, b) => a.localeCompare(b))

    let fieldCount = 0
    for (const key of keys) {
        const field = cls.fields[key]
        if (initializer && field.inInitializer) continue
        fieldCount++

        if (rosettaLuaClass != undefined) {
            const rosettaLuaField = rosettaLuaClass.fields[field.name]
            if (rosettaLuaField != undefined) {
                out.push(
                    `\n---@field ${field.name} ${
                        rosettaLuaField.type != undefined ? rosettaLuaField.type.trim() : 'any'
                    } ${
                        rosettaLuaField.notes != undefined && rosettaLuaField.notes.length !== 0
                            ? rosettaLuaField.notes.trim()
                            : ''
                    }`
                )
            } else {
                out.push(`\n---@field ${field.name} any`)
            }
        } else {
            /* (Legacy Render) */
            out.push(`\n---@field ${field.name} any`)
        }
    }

    if (fieldCount > 0 && !args['strict-fields']) {
        // ensure non-strict fields
        out.push('\n---@field [any] any')
    }

    if (!isSimple) {
        out.push('\n')
    }

    // 'fake' classes should be local
    if (cls.generated) {
        out.push('local ')
    }

    if (cls.base && !cls.generated) {
        out.push(`${cls.name} = ${cls.base}:derive("${cls.name}")`)
    } else if (initializer) {
        out.push(`${cls.name} = ${initializer}`)
    } else {
        out.push(`${cls.name} = {}`)
    }

    if (cls.statics.length > 0) {
        for (const info of cls.statics) {
            const variable = rewriteExpression(info.variable)
            if (!variable) continue

            const init = rewriteExpression(info.init)
            if (!init) continue

            out.push(`\n${variable} = ${init}`)
        }
    }

    annotateFunctionGroup(cls, cls.functions, false, out)
    annotateFunctionGroup(cls, cls.methods, true, out)

    out.push('\n')
}

const annotateFunction = (func: LuaFunction, out: string[]) => {
    out.push(`\n---@return any\nfunction ${func.name}(${func.parameters.join(', ')}) end`)
}

export const annotate = (insRosetta: Rosetta, result: LuaSourceInfo, filename: string, args: AnnotateArgs): string => {
    rosetta = insRosetta
    const out = [PREAMBLE]

    let writtenLocals: Set<string> = new Set()
    for (const local of Object.values(result.locals)) {
        if (!local.referenced) continue

        const expr = rewriteExpression(local.init)
        if (!expr) continue

        writtenLocals.add(local.name)

        if (local.init.type === 'FunctionDeclaration') {
            out.push(`\n---@return any`)
        }

        out.push(`\nlocal ${local.name} = ${expr}`)
    }

    // TODO: refactor
    for (const assign of result.localAssigns) {
        const local = result.locals[assign.base]
        if (!local || !local.referenced) continue

        const variable = rewriteExpression(assign.variable)
        if (!variable) continue

        const init = rewriteExpression(assign.init)
        if (!init) continue

        out.push(`\n${variable} = ${init}`)
    }

    if (writtenLocals.size > 0) {
        out.push('\n')
    }

    const classes = Object.values(result.classes)
    for (const cls of classes) {
        annotateClass(cls, filename, args, out)
    }

    for (const func of result.functions) {
        annotateFunction(func, out)
    }

    if (result.moduleReturns.length > 0) {
        const returns = result.moduleReturns.map((expr) => rewriteExpression(expr))
        if (returns.indexOf(undefined) === -1) {
            out.push('\nreturn ')
            out.push(returns.join(','))
        }
    }

    return out.join('').trimEnd() + '\n'
}
