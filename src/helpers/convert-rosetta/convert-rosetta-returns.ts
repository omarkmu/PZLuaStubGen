import { RosettaReturn } from '../../rosetta'

export const convertRosettaReturns = (
    returns: RosettaReturn[] | undefined,
): Set<string>[] => {
    if (!returns) {
        return []
    }

    return returns.map((x): Set<string> => {
        return x.type ? new Set([x.type]) : new Set()
    })
}
