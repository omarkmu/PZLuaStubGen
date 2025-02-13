import { AnalyzedFunction } from '../../analysis'
import { RosettaFunction } from '../../rosetta'
import { removeUndefinedOrEmpty } from '../remove-undefined-or-empty'
import { convertAnalyzedParameters } from './convert-analyzed-parameters'
import { convertAnalyzedReturns } from './convert-analyzed-returns'

export const convertAnalyzedFunction = (
    func: AnalyzedFunction,
    mergeFunc?: RosettaFunction,
): RosettaFunction => {
    const rosettaFunc: RosettaFunction = { name: func.name }

    rosettaFunc.deprecated = mergeFunc?.deprecated
    rosettaFunc.notes = mergeFunc?.notes
    rosettaFunc.tags = mergeFunc?.tags

    rosettaFunc.parameters = convertAnalyzedParameters(
        func.parameters,
        mergeFunc?.parameters,
    )

    rosettaFunc.return = convertAnalyzedReturns(
        func.returnTypes,
        mergeFunc?.return,
    )

    rosettaFunc.overloads = mergeFunc?.overloads

    return removeUndefinedOrEmpty(rosettaFunc)
}
