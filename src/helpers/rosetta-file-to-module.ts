import {
    RosettaConstructor,
    RosettaField,
    RosettaFile,
    RosettaFunction,
    RosettaOverload,
    RosettaParameter,
    RosettaReturn,
} from '../rosetta'

import {
    AnalyzedClass,
    AnalyzedField,
    AnalyzedFunction,
    AnalyzedModule,
    AnalyzedParameter,
} from '../analysis'

export const rosettaFileToModule = (file: RosettaFile): AnalyzedModule => {
    const classes: AnalyzedClass[] = Object.values(file.classes).map((cls) => {
        return {
            name: cls.name,
            extends: cls.extends,
            generated: cls.tags?.includes('Local'),
            constructors: convertConstructors(cls.constructors, cls.name),
            fields: convertFields(cls.fields),
            staticFields: convertFields(cls.staticFields),
            literalFields: [],
            setterFields: [],
            functions: convertFunctions(cls.staticMethods),
            methods: convertFunctions(cls.methods, true),
            functionConstructors: [],
            overloads: convertOverloads(cls.overloads),
        }
    })

    return {
        id: file.id,
        classes,
        functions: convertFunctions(file.functions),
        locals: [],
        requires: [],
        returns: [],
    }
}

const convertConstructors = (
    constructors: RosettaConstructor[] | undefined,
    clsName: string,
): AnalyzedFunction[] => {
    if (!constructors) {
        return []
    }

    return constructors?.map((x): AnalyzedFunction => {
        return {
            name: 'new',
            parameters: convertParameters(x.parameters),
            returnTypes: [new Set(clsName)],
            isMethod: true,
            isConstructor: true,
        }
    })
}

const convertFunctions = (
    functions: Record<string, RosettaFunction> | undefined,
    isMethod?: boolean,
): AnalyzedFunction[] => {
    if (!functions) {
        return []
    }

    return Object.values(functions).map((x) => {
        return {
            name: x.name,
            parameters: convertParameters(x.parameters),
            returnTypes: convertReturns(x.return),
            isMethod,
        }
    })
}

const convertParameters = (
    params: RosettaParameter[] | undefined,
): AnalyzedParameter[] => {
    if (!params) {
        return []
    }

    return params.map((x) => {
        return {
            name: x.name,
            types: new Set(x.type),
        }
    })
}

const convertReturns = (
    returns: RosettaReturn[] | undefined,
): Set<string>[] => {
    if (!returns) {
        return []
    }

    return returns?.map((x): Set<string> => {
        return x.type ? new Set([x.type]) : new Set()
    })
}

const convertFields = (
    fields: Record<string, RosettaField> | undefined,
): AnalyzedField[] => {
    if (!fields) {
        return []
    }

    return Object.entries(fields).map(([name, field]) => {
        return {
            name,
            types: new Set(field.type),
        }
    })
}

const convertOverloads = (
    overloads: RosettaOverload[] | undefined,
): AnalyzedFunction[] => {
    if (!overloads) {
        return []
    }

    return overloads.map((x) => {
        return {
            name: 'overload',
            parameters: convertParameters(x.parameters),
            returnTypes: convertReturns(x.return),
        }
    })
}
