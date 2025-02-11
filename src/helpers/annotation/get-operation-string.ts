import { LuaOperation } from '../../analysis'
import { getExpressionString } from './get-expression-string'
import { includeAsIs } from './include-as-is'

export const getOperationString = (
    expression: LuaOperation,
    depth?: number,
): string => {
    let lhs = expression.arguments[0]
    let rhs = expression.arguments[1]

    switch (expression.operator) {
        case 'call':
            const callBase = getExpressionString(expression.arguments[0], depth)

            const args: string[] = []
            for (let i = 1; i < expression.arguments.length; i++) {
                args.push(getExpressionString(expression.arguments[i], depth))
            }

            return `${callBase}(${args.join(', ')})`

        default:
            let lhsString = getExpressionString(lhs, depth)
            let rhsString = rhs ? getExpressionString(rhs, depth) : undefined

            if (!includeAsIs(lhs)) {
                lhsString = `(${lhsString})`
            }

            if (rhs && !includeAsIs(rhs)) {
                rhsString = `(${rhsString})`
            }

            if (!rhsString) {
                return `${expression.operator}${lhsString}`
            }

            return `${lhsString} ${expression.operator} ${rhsString}`
    }
}
