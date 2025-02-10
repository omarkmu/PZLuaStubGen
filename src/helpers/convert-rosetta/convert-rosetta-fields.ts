import { AnalyzedField } from '../../analysis'
import { RosettaField } from '../../rosetta'

export const convertRosettaFields = (
    fields: Record<string, RosettaField> | undefined,
): AnalyzedField[] => {
    if (!fields) {
        return []
    }

    return Object.entries(fields).map(([name, field]) => {
        return {
            name,
            types: new Set(field.type ? [field.type] : []),
        }
    })
}
