import { AnalyzedTable } from '../../analysis'
import { WritableRosettaTable } from '../../rosetta'
import { convertAnalyzedFields } from './convert-analyzed-fields'
import { convertAnalyzedFunctions } from './convert-analyzed-functions'
import { convertAnalyzedOverloads } from './convert-analyzed-overloads'

export const convertAnalyzedTable = (
    table: AnalyzedTable,
): WritableRosettaTable => {
    const rosettaTable: WritableRosettaTable = { name: table.name }

    if (table.staticFields.length > 0) {
        rosettaTable.staticFields = convertAnalyzedFields(table.staticFields)
    }

    if (table.overloads.length > 0) {
        rosettaTable.overloads = convertAnalyzedOverloads(table.overloads)
    }

    if (table.methods.length > 0) {
        rosettaTable.methods = convertAnalyzedFunctions(table.methods)
    }

    if (table.functions.length > 0) {
        rosettaTable.staticMethods = convertAnalyzedFunctions(table.functions)
    }

    if (table.local) {
        rosettaTable.tags = ['Local']
    }

    return rosettaTable
}
