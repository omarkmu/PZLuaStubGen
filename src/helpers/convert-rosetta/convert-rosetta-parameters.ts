import { RosettaParameter } from '../../rosetta'
import { AnalyzedParameter } from '../../analysis'

export const convertRosettaParameters = (
    params: RosettaParameter[] | undefined,
): AnalyzedParameter[] => {
    if (!params) {
        return []
    }

    return params.map((x): AnalyzedParameter => {
        return {
            name: x.name,
            types: new Set(x.type),
        }
    })
}
