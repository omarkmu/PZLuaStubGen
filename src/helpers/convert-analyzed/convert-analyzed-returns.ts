import { RosettaReturn } from '../../rosetta'
import { removeUndefinedOrEmpty } from '../remove-undefined-or-empty'
import { convertAnalyzedTypes } from './convert-analyzed-types'

export const convertAnalyzedReturns = (
    returns: Set<string>[],
    mergeReturns?: RosettaReturn[],
): RosettaReturn[] => {
    return returns.map((x, i): RosettaReturn => {
        const ret: RosettaReturn = {}
        const mergeRet = mergeReturns?.[i]
        const [type, nullable] = convertAnalyzedTypes(x)

        ret.type = type ?? 'unknown'

        if (nullable) {
            ret.nullable = true
        }

        ret.notes = mergeRet?.notes

        return removeUndefinedOrEmpty(ret)
    })
}
