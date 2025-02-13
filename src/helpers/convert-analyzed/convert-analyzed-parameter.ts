import { RosettaParameter } from '../../rosetta'
import { AnalyzedParameter } from '../../analysis'
import { convertAnalyzedTypes } from './convert-analyzed-types'
import { removeUndefinedOrEmpty } from '../remove-undefined-or-empty'

export const convertAnalyzedParameter = (
    param: AnalyzedParameter,
    mergeParam?: RosettaParameter,
): RosettaParameter => {
    const rosettaParam: RosettaParameter = { name: param.name }
    const [types, nullable] = convertAnalyzedTypes(param.types)

    rosettaParam.type = types

    if (nullable) {
        rosettaParam.optional = true
    }

    rosettaParam.nullable = mergeParam?.nullable
    rosettaParam.notes = mergeParam?.notes

    return removeUndefinedOrEmpty(rosettaParam)
}
