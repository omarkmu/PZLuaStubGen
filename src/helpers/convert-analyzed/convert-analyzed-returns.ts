import { RosettaReturn } from '../../rosetta'
import { convertAnalyzedTypes } from './convert-analyzed-types'

export const convertAnalyzedReturns = (
    returns: Set<string>[],
): RosettaReturn[] => {
    return returns.map((x): RosettaReturn => {
        const ret: RosettaReturn = {}
        const [type, nullable] = convertAnalyzedTypes(x)

        ret.type = type ?? 'unknown'

        if (nullable) {
            ret.nullable = true
        }

        return ret
    })
}
