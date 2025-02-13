import { AnalyzedField } from '../../analysis'
import { RosettaField } from '../../rosetta'
import { expressionToDefaultValue } from '../expression-to-default-value'
import { removeUndefinedOrEmpty } from '../remove-undefined-or-empty'
import { convertAnalyzedTypes } from './convert-analyzed-types'

export const convertAnalyzedField = (
    field: AnalyzedField,
    mergeField?: RosettaField,
): RosettaField => {
    const rosettaField: RosettaField = {}
    const [types, nullable] = convertAnalyzedTypes(field.types)

    let hasValue = false
    let defaultValue: string | undefined
    if (field.expression) {
        hasValue = true
        defaultValue = expressionToDefaultValue(
            field.expression,
            mergeField?.defaultValue,
        )
    }

    if (types && (!hasValue || nullable)) {
        rosettaField.type = types
    }

    if (nullable) {
        rosettaField.nullable = nullable
    }

    rosettaField.notes = mergeField?.notes
    rosettaField.tags = mergeField?.tags
    rosettaField.defaultValue = defaultValue

    return removeUndefinedOrEmpty(rosettaField)
}
