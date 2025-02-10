import { RosettaParameter } from '../../rosetta'
import { AnalyzedParameter } from '../../analysis'
import { convertAnalyzedTypes } from './convert-analyzed-types'

export const convertAnalyzedParameters = (
    params: AnalyzedParameter[],
): RosettaParameter[] => {
    return params.map((x): RosettaParameter => {
        const param: RosettaParameter = { name: x.name }
        const [types, nullable] = convertAnalyzedTypes(x.types)

        if (types) {
            param.type = types
        }

        if (nullable) {
            param.optional = true
        }

        return param
    })
}
