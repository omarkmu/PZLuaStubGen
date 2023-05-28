import ast from 'luaparse'
import { ParseResult } from './types'
import { ParseContext } from './context'
import {
    getIdentifierBase,
    getParameterList,
    sanitizeLua
} from './utils'

// TODO: module-level dependency calculation

const addBodyToStack = (statement: ast.Statement, stack: ast.Statement[][]): void => {
    switch (statement.type) {
        case 'DoStatement':
        case 'WhileStatement':
        case 'RepeatStatement':
        case 'ForGenericStatement':
        case 'ForNumericStatement':
            stack.push(statement.body)
            break
        case 'IfStatement':
            for (const clause of statement.clauses) {
                stack.push(clause.body)
            }

            break
    }
}

/**
 * Resolves a set of return identifiers.
 * This is usually just `o` for constructors.
 */
const getConstructorReturns = (statements: ast.Statement[]): Set<string> => {
    const returns: Set<string> = new Set()
    const stack = [ statements ]
    while (stack.length > 0) {
        const body = stack.pop()!

        for (const statement of body) {
            if (statement.type === 'ReturnStatement') {
                if (statement.arguments.length !== 1) {
                    continue
                }

                const first = statement.arguments[0]
                if (first.type !== 'Identifier') {
                    continue
                }

                returns.add(first.name)
            } else {
                addBodyToStack(statement, stack)
            }
        }
    }

    return returns
}

const parseFunctionBody = (ctx: ParseContext, statements: ast.Statement[]) => {
    const stack = [ statements ]
    while (stack.length > 0) {
        const body = stack.pop()!

        for (const statement of body) {
            addBodyToStack(statement, stack)

            if (statement.type !== 'AssignmentStatement') continue

            for (const variable of statement.variables) {
                if (variable.type !== 'MemberExpression') continue

                // check for Class.x = y
                const base = variable.base
                if (base.type !== 'Identifier') continue

                const clsIdent = getIdentifierBase(base)
                if (!clsIdent || !ctx.hasClass(clsIdent.name)) continue

                // ignore __index
                const identifier = variable.identifier
                if (identifier.name === '__index') continue

                ctx.addField(clsIdent.name, identifier.name)
            }
        }
    }
}

/**
 * Analyzes a method body to determine additional class fields.
 * @returns If the method is a `new` function, returns the return type.
 */
const parseMethodBody = (ctx: ParseContext, cls: string, statements: ast.Statement[], isConstructor: boolean, isMethod: boolean): string | undefined => {
    if (!isMethod && !isConstructor) {
        return
    }

    let selfSet
    if (isConstructor) {
        selfSet = getConstructorReturns(statements)
    }

    let baseType: string | undefined
    let confirmedInstance = false
    const isNewFunction = isConstructor && !isMethod

    const stack = [ statements ]
    const fields: string[] = []
    const functions: [string, string[], boolean][] = []

    while (stack.length > 0) {
        const body = stack.pop()!

        for (const statement of body) {
            if (statement.type === 'AssignmentStatement') {
                for (const variable of statement.variables) {
                    if (variable.type !== 'MemberExpression') continue

                    // check for self.x = y
                    const base = variable.base
                    if (base.type !== 'Identifier') continue
                    if (base.name !== 'self' && !selfSet?.has(base.name)) continue

                    // ignore __index
                    const identifier = variable.identifier
                    if (identifier.name === '__index') continue

                    fields.push(identifier.name)
                }

                continue
            }

            addBodyToStack(statement, stack)
            if (!isNewFunction) continue

            if (statement.type === 'CallStatement' && !confirmedInstance) {
                // check for setmetatable calls
                if (statement.expression.type !== 'CallExpression') continue

                const base = statement.expression.base
                if (base.type !== 'Identifier' || base.name !== 'setmetatable') continue

                const args = statement.expression.arguments
                if (args.length !== 2) continue

                const target = statement.expression.arguments[0]
                if (target.type !== 'Identifier' || !selfSet?.has(target.name)) continue

                const init = statement.expression.arguments[1]
                if (init.type === 'TableConstructorExpression' && init.fields.length === 1) {
                    const field = init.fields[0]
                    if (field.type === 'TableValue') continue
                    if (field.key.type !== 'Identifier') continue
                    if (field.key.name !== '__index') continue
                    if (field.value.type !== 'Identifier') continue

                    confirmedInstance = field.value.name === cls
                } else {
                    confirmedInstance = init.type === 'Identifier' && init.name === cls
                }
            } else if (statement.type === 'LocalStatement' && !baseType) {
                // check for instance initialization to determine base type
                if (statement.variables.length !== 1) continue 
                if (statement.init.length !== 1) continue
                if (!selfSet?.has(statement.variables[0].name)) continue

                const init = statement.init[0]
                if (init.type !== 'CallExpression') continue
                if (init.base.type !== 'MemberExpression') continue
                if (init.base.base.type !== 'Identifier') continue
                if (init.base.identifier.name !== 'new') continue

                // local self = X.new()
                baseType = init.base.base.name
            } else if (statement.type === 'FunctionDeclaration') {
                // check for member functions in closure
                if (statement.identifier?.type !== 'MemberExpression') continue

                // confirm that it's a member function of the instance
                const base = statement.identifier.base
                if (base.type !== 'Identifier') continue
                if (!selfSet?.has(base.name)) continue

                const name = statement.identifier.identifier.name
                const params = getParameterList(statement.parameters)

                functions.push([name, params, statement.identifier.indexer === ':'])
            }

            continue
        }
    }

    if (isNewFunction && !confirmedInstance) {
        // not an instance; need a "fake" instance class
        cls = `${cls}_Instance`
        const clsObj = ctx.addClass(cls, baseType)

        if (clsObj) {
            clsObj.generated = true
        }
    }

    for (const field of fields) {
        ctx.addField(cls, field)
    }

    for (const [func, params, isMethod] of functions) {
        ctx.addMemberFunction(cls, func, params, isMethod)
    }

    if (isConstructor) {
        return cls
    }
}

const parseAssignmentStatement = (ctx: ParseContext, expr: ast.AssignmentStatement) => {
    for (const [i, variable] of expr.variables.entries()) {
        const init = expr.init[i]
        if (!init) break

        switch (variable.type) {
            case 'Identifier':
                switch (init.type) {
                    case 'TableConstructorExpression':
                        ctx.addClass(variable.name, undefined, init)
                        break
                    case 'LogicalExpression':
                        parseAssignmentLogical(ctx, variable, init)
                        break
                    case 'StringCallExpression':
                        if (init.base.type !== 'Identifier') return
                        if (init.base.name !== 'require') return
                        const cls = ctx.addClass(variable.name, undefined, init)
                        if (cls) {
                            // this only applies to SandboxVars; intentionally excluding for now
                            // TODO: better support for SandboxVars
                            cls.noAnnotation = true
                        }
                        break
                    case 'CallExpression':
                        parseAssignmentCall(ctx, variable, init)
                        break
                    case 'FunctionDeclaration':
                        parseFunction(ctx, variable, init)
                        break
                    case 'Identifier':
                        ctx.addAlias(variable.name, init.name)
                        break
                }

                break
            case 'IndexExpression':
                ctx.addAssignment(variable, init)
                break
            case 'MemberExpression':
                switch (init.type) {
                    case 'FunctionDeclaration':
                        parseMemberFunction(ctx, variable, init)
                        break
                    default:
                        ctx.addAssignment(variable, init)
                }

                break
        }
    }
}

const parseLocalStatement = (ctx: ParseContext, expr: ast.LocalStatement) => {
    for (const [i, variable] of expr.variables.entries()) {
        const init = expr.init[i]
        if (!init) break

        if (init.type === 'Identifier') {
            // handle local reassignments of classes
            ctx.addAlias(variable.name, init.name)
        }

        ctx.addLocal(variable.name, init)
    }
}

const parseAssignmentCall = (ctx: ParseContext, variable: ast.Identifier, expr: ast.CallExpression) => {
    // x = y:derive("x")
    const base = expr.base
    if (base.type === 'Identifier' && base.name === 'require' && expr.arguments.length === 1) {
        // require → create class
        return ctx.addClass(variable.name, undefined, expr)
    }

    if (base.type !== 'MemberExpression' || base.identifier.name !== 'derive' || base.indexer !== ':') {
        return
    }

    const ident = base.base
    if (ident.type !== 'Identifier') return

    // ensure it matches the expected derive call signature
    const args = expr.arguments
    if (args.length !== 1 || args[0].type !== 'StringLiteral') return

    return ctx.addClass(variable.name, ident.name)
}

const parseAssignmentLogical = (ctx: ParseContext, variable: ast.Identifier, init: ast.LogicalExpression) => {
    if (init.operator !== 'or') return
    if (init.right.type !== 'TableConstructorExpression') return

    // x = x or {...}
    if (init.left.type === 'Identifier' && init.left.name === variable.name) {
        ctx.addClass(variable.name, undefined, init)
        return
    }

    // x.y = z or {...}
    if (init.left.type !== 'MemberExpression') return

    const base = getIdentifierBase(init.left)
    if (!base || !ctx.hasClass(base.name)) return

    ctx.addStatic(base.name, variable, init)
}

const parseFunction = (ctx: ParseContext, identifier: ast.Identifier, expr: ast.FunctionDeclaration) => {
    if (expr.isLocal) {
        ctx.addLocal(identifier.name, expr)
        return
    }

    parseFunctionBody(ctx, expr.body)
    return ctx.addFunction(identifier.name, getParameterList(expr.parameters))
}

const parseMemberFunction = (ctx: ParseContext, member: ast.MemberExpression, expr: ast.FunctionDeclaration) => {
    if (member.base.type !== 'Identifier') {
        return
    }

    const className = member.base.name
    const name = member.identifier.name
    const params = getParameterList(expr.parameters)
    const isConstructor = name === 'new'
    const isMethod = member.indexer === ':'

    if (isConstructor || isMethod) {
        const returnType = parseMethodBody(ctx, className, expr.body, isConstructor, isMethod)

        if (isConstructor && returnType) {
            ctx.setClassConstructorType(className, returnType)
        }
    } else {
        parseFunctionBody(ctx, expr.body)
    }

    return ctx.addMemberFunction(className, name, params, isMethod)
}

const parseTree = (ctx: ParseContext, tree: ast.Chunk) => {
    for (const stmt of tree.body) {
        switch (stmt.type) {
            case 'ReturnStatement':
                ctx.setModuleReturns(stmt.arguments)
                break
            case 'LocalStatement':
                parseLocalStatement(ctx, stmt)
                break
            case 'AssignmentStatement':
                parseAssignmentStatement(ctx, stmt)
                break
            case 'IfStatement':
                // if x == nil then x = {} end
                if (stmt.clauses.length !== 1) break
                const clause = stmt.clauses[0]
                if (clause.type !== 'IfClause') break
                if (clause.body.length !== 1) break

                const inner = clause.body[0]
                if (inner.type !== 'AssignmentStatement') break
                if (inner.variables.length !== 1) break
                if (inner.init.length !== 1) break

                const lhs = inner.variables[0]
                const rhs = inner.init[0]

                if (lhs.type !== 'Identifier') break
                if (rhs.type !== 'TableConstructorExpression') break

                let expr
                if (clause.condition.type === 'UnaryExpression' && clause.condition.operator === 'not') {
                    expr = clause.condition.argument
                } else if (clause.condition.type === 'BinaryExpression' && clause.condition.operator === '==' && clause.condition.right.type === 'NilLiteral') {
                    expr = clause.condition.left
                }

                if (!expr || expr.type !== 'Identifier' || expr.name !== lhs.name) break

                // build x or {}
                ctx.addClass(expr.name, undefined, {
                    type: 'LogicalExpression',
                    operator: 'or',
                    left: expr,
                    right: rhs
                })

                break
            case 'FunctionDeclaration':
                const ident = stmt.identifier
                if (ident?.type === 'MemberExpression') {
                    parseMemberFunction(ctx, ident, stmt)
                } else if (ident?.type === 'Identifier') {
                    parseFunction(ctx, ident, stmt)
                }

                break
        }
    }
}

/**
 * Parses the contents of a single Lua file.
 * @param input Lua source.
 */
export const parse = (input: string): ParseResult => {
    input = sanitizeLua(input)

    try {
        const tree = ast.parse(input, {
            comments: false,
            luaVersion: '5.1',
        })

        const ctx = new ParseContext()

        parseTree(ctx, tree)

        return {
            success: true,
            result: ctx.result()
        }
    } catch (e) {
        return {
            success: false,
            error: e
        }
    }
}
