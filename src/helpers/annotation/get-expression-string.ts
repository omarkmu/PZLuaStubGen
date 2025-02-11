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
            const indexBase = getExpressionString(expression.base)
            const index = getExpressionString(expression.index)

            return `${indexBase}[${index}]`

        case 'member':
            const memberBase = getExpressionString(expression.base)

            return `${memberBase}${expression.indexer}${expression.member}`

        case 'operation':
            return getOperationString(expression, depth)
    }
}
