import { AnalyzedClass } from '../../analysis'
import { RosettaClass, WritableRosettaClass } from '../../rosetta'
import { removeUndefinedOrEmpty } from '../remove-undefined-or-empty'
import { convertAnalyzedConstructors } from './convert-analyzed-constructors'
import { convertAnalyzedFields } from './convert-analyzed-fields'
import { convertAnalyzedFunctions } from './convert-analyzed-functions'
import { convertAnalyzedOverloads } from './convert-analyzed-overloads'

export const convertAnalyzedClass = (
    cls: AnalyzedClass,
    mergeCls?: RosettaClass,
): WritableRosettaClass => {
    const rosettaCls: WritableRosettaClass = { name: cls.name }

    rosettaCls.extends = cls.extends ?? mergeCls?.extends
    rosettaCls.deprecated = mergeCls?.deprecated
    rosettaCls.mutable = mergeCls?.mutable

    if (cls.local) {
        rosettaCls.local = true
    }

    rosettaCls.notes = mergeCls?.notes
    rosettaCls.tags = mergeCls?.tags

    rosettaCls.constructors = convertAnalyzedConstructors(
        cls.constructors,
        mergeCls?.constructors,
    )

    rosettaCls.staticFields = convertAnalyzedFields(
        [...cls.staticFields, ...cls.setterFields],
        mergeCls?.staticFields,
    )

    rosettaCls.fields = convertAnalyzedFields(cls.fields, mergeCls?.fields)

    rosettaCls.overloads = convertAnalyzedOverloads(
        cls.overloads,
        mergeCls?.overloads,
    )

    rosettaCls.operators = mergeCls?.operators

    rosettaCls.methods = convertAnalyzedFunctions(
        cls.methods,
        mergeCls?.methods,
    )

    rosettaCls.staticMethods = convertAnalyzedFunctions(
        [...cls.functions, ...cls.functionConstructors],
        mergeCls?.staticMethods,
    )

    return removeUndefinedOrEmpty(rosettaCls)
}
