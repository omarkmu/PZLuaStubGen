import { AnalyzedFunction } from '../../analysis'
import { RosettaConstructor } from '../../rosetta'
import { convertAnalyzedParameters } from './convert-analyzed-parameters'

export const convertAnalyzedConstructors = (
    constructors: AnalyzedFunction[],
): RosettaConstructor[] => {
    return constructors.map((x): RosettaConstructor => {
        const cons: RosettaConstructor = {}

        if (x.parameters.length > 0) {
            cons.parameters = convertAnalyzedParameters(x.parameters)
        }

        return cons
    })
}
