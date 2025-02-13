import { AnalyzedTable } from '../../analysis'
import { RosettaTable, WritableRosettaTable } from '../../rosetta'
import { removeUndefinedOrEmpty } from '../remove-undefined-or-empty'
import { convertAnalyzedFields } from './convert-analyzed-fields'
import { convertAnalyzedFunctions } from './convert-analyzed-functions'
import { convertAnalyzedOverloads } from './convert-analyzed-overloads'

export const convertAnalyzedTable = (
    table: AnalyzedTable,
    mergeTable?: RosettaTable,
): WritableRosettaTable => {
    const rosettaTable: WritableRosettaTable = { name: table.name }

    rosettaTable.deprecated = mergeTable?.deprecated
    rosettaTable.mutable = mergeTable?.mutable

    if (table.local) {
        rosettaTable.local = true
    }

    rosettaTable.notes = mergeTable?.notes
    rosettaTable.tags = mergeTable?.tags

    rosettaTable.staticFields = convertAnalyzedFields(
        table.staticFields,
        mergeTable?.staticFields,
    )

    rosettaTable.overloads = convertAnalyzedOverloads(
        table.overloads,
        mergeTable?.overloads,
    )

    rosettaTable.operators = mergeTable?.operators

    rosettaTable.methods = convertAnalyzedFunctions(
        table.methods,
        mergeTable?.methods,
    )

    rosettaTable.staticMethods = convertAnalyzedFunctions(
        table.functions,
        mergeTable?.staticMethods,
    )

    return removeUndefinedOrEmpty(rosettaTable)
}
