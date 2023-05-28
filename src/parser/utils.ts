import ast from 'luaparse'

const numericRegexp = /(\d)[lf]([,;)\s])/g

export const sanitizeLua = (lua: string): string => {
    // based on PipeWrench-Modeler
    lua = lua.replace(numericRegexp, '$1$2')

    while (lua.indexOf('break;') !== -1) {
        lua = lua.replace('break;', 'break ')
    }

    return lua
}

/**
 * Searches for references to identifiers in an expression.
 * @param expression The expression to search.
 * @returns A list of identifier strings.
 */
export const findIdentifierReferences = (expression: ast.Expression): string[] => {
    const references: string[] = []
    const stack: ast.Expression[] = [ expression ]

    while (stack.length > 0) {
        const expr = stack.pop()!

        switch (expr.type) {
            case 'Identifier':
                references.push(expr.name)
                break
            case 'TableConstructorExpression':
                for (const field of expr.fields) {
                    if (field.type === 'TableKey' || field.type === 'TableKeyString') {
                        stack.push(field.key)
                    }

                    stack.push(field.value)
                }

                break
            case 'LogicalExpression':
            case 'BinaryExpression':
                stack.push(expr.left)
                stack.push(expr.right)
                break
            case 'UnaryExpression':
                stack.push(expr.argument)
                break
            case 'IndexExpression':
                stack.push(expr.base)
                stack.push(expr.index)
                break
            case 'MemberExpression':
                stack.push(expr.base)
                stack.push(expr.identifier)
                break
            case 'CallExpression':
                stack.push(expr.base)
                stack.push(...expr.arguments)
                break
            case 'TableCallExpression':
                stack.push(expr.base)
                stack.push(expr.arguments)
                break
            case 'StringCallExpression':
                stack.push(expr.base)
                stack.push(expr.argument)
                break
        }
    }

    return references
}

export const getParameterList = (parameters: (ast.Identifier | ast.VarargLiteral)[]) => {
    const params: string[] = []
    for (const param of parameters) {
        if (param.type === 'Identifier') {
            params.push(param.name)
        } else {
            params.push(param.raw)
        }
    }

    return params
}

export const getIdentifierBase = (expr: ast.Expression): ast.Identifier | undefined => {
    switch (expr.type) {
        case 'MemberExpression':
        case 'IndexExpression':
            const base = expr.base
            if (base.type === 'Identifier') {
                return base
            }

            return getIdentifierBase(base)
        case 'Identifier':
            return expr
    }
}
