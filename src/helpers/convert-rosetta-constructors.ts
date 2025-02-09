import { AnalyzedFunction } from '../analysis'
import { RosettaConstructor } from '../rosetta'
import { convertRosettaParameters } from './convert-rosetta-parameters'

export const convertRosettaConstructors = (
    constructors: RosettaConstructor[] | undefined,
    clsName: string,
): AnalyzedFunction[] => {
    if (!constructors) {
        return []
    }

    return constructors.map((x): AnalyzedFunction => {
        return {
            name: 'new',
            parameters: convertRosettaParameters(x.parameters),
            returnTypes: [new Set(clsName)],
            isMethod: true,
            isConstructor: true,
        }
    })
}
