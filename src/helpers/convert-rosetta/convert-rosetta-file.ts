import { AnalyzedModule } from '../../analysis'
import { RosettaFile } from '../../rosetta'
import { convertRosettaClass } from './convert-rosetta-class'
import { convertRosettaFunctions } from './convert-rosetta-functions'
import { convertRosettaTable } from './convert-rosetta-table'

export const convertRosettaFile = (file: RosettaFile): AnalyzedModule => {
    return {
        id: file.id,
        classes: Object.values(file.classes).map(convertRosettaClass),
        tables: Object.values(file.tables).map(convertRosettaTable),
        functions: convertRosettaFunctions(file.functions),
        requires: [],
        returns: [],
    }
}
