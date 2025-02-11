import { LuaExpression } from '../../analysis'
import { RosettaField } from '../../rosetta'
import { getExpressionString } from './get-expression-string'

export const getValueString = (
    expression: LuaExpression | undefined,
    rosettaField: RosettaField | undefined,
    typeString: string | undefined,
    hasRosettaType: boolean,
    hasTableLiteral: boolean,
    depth: number = 1,
): [string, string | undefined] => {
    let valueString: string
    if (rosettaField?.defaultValue) {
        valueString = rosettaField.defaultValue
        typeString = hasRosettaType ? typeString : undefined
    } else if (expression && !hasRosettaType) {
        valueString = getExpressionString(expression, depth)
    } else {
        valueString = 'nil'
    }

    if (valueString === 'nil' && typeString === 'any?') {
        typeString = undefined
    }

    // don't write `---@type table` when a table literal is available
    if (hasTableLiteral && typeString === 'table' && valueString !== 'nil') {
        typeString = undefined
    }

    return [valueString.trim(), typeString]
}
