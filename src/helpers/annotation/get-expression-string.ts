import { LuaExpression } from '../../analysis'
import { getLiteralString } from './get-literal-string'
import { getOperationString } from './get-operation-string'

export const getExpressionString = (
    expression: LuaExpression,
    depth: number = 1,
): string => {
    switch (expression.type) {
        case 'reference':
            return expression.id

        case 'require':
            return `require("${expression.module}")`

        case 'literal':
            return getLiteralString(expression, depth)

        case 'index':
            let indexBase = getExpressionString(expression.base, depth)
            const index = getExpressionString(expression.index, depth)

            indexBase = doBaseParentheses(expression.base)
                ? `(${indexBase})`
                : indexBase

            return `${indexBase}[${index}]`

        case 'member':
            let memberBase = getExpressionString(expression.base, depth)
            memberBase = doBaseParentheses(expression.base)
                ? `(${memberBase})`
                : memberBase

            return `${memberBase}${expression.indexer}${expression.member}`

        case 'operation':
            return getOperationString(expression, depth)
    }
}

const doBaseParentheses = (base: LuaExpression): boolean => {
    switch (base.type) {
        case 'reference':
        case 'index':
        case 'member':
        case 'require':
            return false

        case 'operation':
            return base.operator !== 'call'

        default:
            return true
    }
}
