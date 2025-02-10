import { AnalyzedFunction } from '../../analysis'
import { RosettaFunction } from '../../rosetta'
import { convertAnalyzedParameters } from './convert-analyzed-parameters'
import { convertAnalyzedReturns } from './convert-analyzed-returns'

export const convertAnalyzedFunctions = (
    functions: AnalyzedFunction[],
): RosettaFunction[] => {
    return functions.map((x): RosettaFunction => {
        const func: RosettaFunction = { name: x.name }

        if (x.parameters.length > 0) {
            func.parameters = convertAnalyzedParameters(x.parameters)
        }

        if (x.returnTypes.length > 0) {
            func.return = convertAnalyzedReturns(x.returnTypes)
        }

        return func
    })
}
