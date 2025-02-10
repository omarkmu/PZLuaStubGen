import { AnalyzedField } from '../../analysis'
import { RosettaField } from '../../rosetta'
import { convertAnalyzedTypes } from './convert-analyzed-types'

export const convertAnalyzedFields = (
    fields: AnalyzedField[],
): Record<string, RosettaField> => {
    return fields
        .map((x): [RosettaField, string] => {
            const field: RosettaField = {}
            const [types, nullable] = convertAnalyzedTypes(x.types)

            if (types) {
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
