import { AnalyzedField } from '../../analysis'
import { RosettaField } from '../../rosetta'
import { convertRosettaTypes } from './convert-rosetta-types'

export const convertRosettaFields = (
    fields: Record<string, RosettaField> | undefined,
): AnalyzedField[] => {
    if (!fields) {
        return []
    }

    return Object.entries(fields).map(([name, field]) => {
        return {
            name,
            types: convertRosettaTypes(field.type, field.nullable),
        }
    })
}
