import { AnalyzedClass } from '../../analysis'
import { WritableRosettaClass } from '../../rosetta'
import { convertAnalyzedConstructors } from './convert-analyzed-constructors'
import { convertAnalyzedFields } from './convert-analyzed-fields'
import { convertAnalyzedFunctions } from './convert-analyzed-functions'
import { convertAnalyzedOverloads } from './convert-analyzed-overloads'

export const convertAnalyzedClass = (
    cls: AnalyzedClass,
): WritableRosettaClass => {
    const rosettaCls: WritableRosettaClass = { name: cls.name }

    if (cls.extends) {
        rosettaCls.extends = cls.extends
    }

    if (cls.local) {
        rosettaCls.local = true
    }

    if (cls.constructors.length > 0) {
        rosettaCls.constructors = convertAnalyzedConstructors(cls.constructors)
    }

    if (cls.staticFields.length > 0) {
        rosettaCls.staticFields = convertAnalyzedFields(cls.staticFields)
    }

    if (cls.setterFields.length > 0) {
        rosettaCls.staticFields ??= {}
        const fields = convertAnalyzedFields(cls.setterFields)

        for (const [name, field] of Object.entries(fields)) {
            rosettaCls.staticFields[name] = field
        }
    }

    if (cls.fields.length > 0) {
        rosettaCls.fields = convertAnalyzedFields(cls.fields)
    }

    if (cls.overloads.length > 0) {
        rosettaCls.overloads = convertAnalyzedOverloads(cls.overloads)
    }

    if (cls.methods.length > 0) {
        rosettaCls.methods = convertAnalyzedFunctions(cls.methods)
    }

    if (cls.functions.length > 0) {
        rosettaCls.staticMethods = convertAnalyzedFunctions(cls.functions)
    }

    if (cls.functionConstructors.length > 0) {
        rosettaCls.staticMethods ??= []
        rosettaCls.staticMethods.push(
            ...convertAnalyzedFunctions(cls.functionConstructors),
        )
    }

    return rosettaCls
}
