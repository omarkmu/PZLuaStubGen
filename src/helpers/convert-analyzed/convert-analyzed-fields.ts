import { AnalyzedField } from '../../analysis'
import { RosettaField } from '../../rosetta'
import { containsLiteralTable, getExpressionString } from '../annotation'
import { convertAnalyzedTypes } from './convert-analyzed-types'

export const convertAnalyzedFields = (
    fields: AnalyzedField[],
): Record<string, RosettaField> => {
    return fields
        .map((x): [RosettaField, string] => {
            const field: RosettaField = {}
            const [types, nullable] = convertAnalyzedTypes(x.types)

            let hasValue = false
            if (x.expression) {
                hasValue = true
                const expr = !containsLiteralTable(x.expression)
                    ? getExpressionString(x.expression)
                    : 'nil'

                if (expr !== 'nil') {
                    field.defaultValue = expr
                }
            }

            if (types && (!hasValue || nullable)) {
                field.type = types
            }

            if (nullable) {
                field.nullable = true
            }

            return [field, x.name]
        })
        .reduce<Record<string, RosettaField>>((rec, value) => {
            rec[value[1]] = value[0]
            return rec
        }, {})
}
