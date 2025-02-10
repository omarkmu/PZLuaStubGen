import { RosettaReturn } from '../../rosetta'
import { convertAnalyzedTypes } from './convert-analyzed-types'

export const convertAnalyzedReturns = (
    returns: Set<string>[],
): RosettaReturn[] => {
    return returns.map((x): RosettaReturn => {
        const ret: RosettaReturn = {}
        const [types, nullable] = convertAnalyzedTypes(x)

        ret.type = types ?? 'any'

        if (nullable) {
            ret.nullable = true
        }

        return ret
    })
}
