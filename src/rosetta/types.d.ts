export interface RosettaArgs {
    inputDirectory: string
    suppressErrors?: boolean
}

export interface RosettaFile {
    id: string

    classes: Record<string, RosettaClass>
    tables: Record<string, RosettaTable>
    functions: Record<string, RosettaFunction>
}

export interface RosettaClass {
    name: string
    extends?: string
    notes?: string
    deprecated?: boolean
    mutable?: boolean

    constructors?: RosettaConstructor[]
    fields?: Record<string, RosettaField>
    staticFields?: Record<string, RosettaField>
    methods?: Record<string, RosettaMethod>
    staticMethods?: Record<string, RosettaMethod>
    overloads?: RosettaOverload[]
    operators?: RosettaOperator[]
    tags?: string[]
}

export interface RosettaTable {
    name: string
    notes?: string
    deprecated?: boolean
    mutable?: boolean

    staticFields?: Record<string, RosettaField>
    methods?: Record<string, RosettaMethod>
    staticMethods?: Record<string, RosettaMethod>
    overloads?: RosettaOverload[]
    operators?: RosettaOperator[]
    tags?: string[]
}

interface HasMethodLists {
    methods?: RosettaMethod[]
    staticMethods?: RosettaMethod[]
}

export type WritableRosettaClass = HasMethodLists &
    Omit<RosettaClass, 'methods' | 'staticMethods'>

export type WritableRosettaTable = HasMethodLists &
    Omit<RosettaTable, 'methods' | 'staticMethods'>

export interface RosettaConstructor {
    notes?: string
    deprecated?: boolean
    parameters?: RosettaParameter[]
}

export interface RosettaFunction {
    name: string
    notes?: string
    deprecated?: boolean
    parameters?: RosettaParameter[]
    return?: RosettaReturn[]
    overloads?: RosettaOverload[]
    tags?: string[]
}

export type RosettaMethod = RosettaFunction

export interface RosettaOperator {
    operation?: string
    parameter?: string
    return?: string
    tags?: string[]
}

export interface RosettaOverload {
    notes?: string
    parameters?: RosettaParameter[]
    return?: RosettaReturn[]
    tags?: string[]
}

export interface RosettaField {
    type?: string
    notes?: string
    nullable?: boolean
    tags?: string[]
}

export interface RosettaParameter {
    name: string
    type?: string
    notes?: string
    optional?: boolean
    nullable?: boolean
}

export interface RosettaReturn {
    name?: string
    type?: string
    notes?: string
    nullable?: boolean
}
