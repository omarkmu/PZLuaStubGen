import { AnalyzedModule } from '../analysis'
import { RosettaFile } from '../rosetta'
import { convertRosettaClass } from './convert-rosetta-class'
import { convertRosettaFunctions } from './convert-rosetta-functions'

export const convertRosettaFile = (file: RosettaFile): AnalyzedModule => {
    return {
        id: file.id,
        classes: Object.values(file.classes).map(convertRosettaClass),
        functions: convertRosettaFunctions(file.functions),
        locals: [],
        requires: [],
        returns: [],
    }
}
