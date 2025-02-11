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
                if (!containsLiteralTable(x.expression)) {
                    field.defaultValue = getExpressionString(x.expression)
                }

                if (field.defaultValue === 'nil') {
                    delete field.defaultValue
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
