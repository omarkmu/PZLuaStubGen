import ast from 'luaparse'

export interface LuaFunction {
    name: string
    parameters: string[]
}

export interface LuaClass {
    name: string
    fields: { [name: string]: LuaField }
    methods: LuaFunction[]
    functions: LuaFunction[]
    statics: LuaAssignment[]
    generated?: boolean
    constructorType?: string
    base?: string
    init?: ast.Expression
    noAnnotation?: boolean
}

export interface LuaField {
    name: string
    inInitializer: boolean
}

export interface LuaLocal {
    name: string
    referenced: boolean
    dependencies: string[]
    init: ast.Expression
}

export interface LuaAssignment {
    base: string
    variable: ast.Expression
    init: ast.Expression
}

export interface LuaSourceInfo {
    error?: any
    classes: { [cls: string]: LuaClass }
    functions: LuaFunction[]
    locals: { [name: string]: LuaLocal }
    localAssigns: LuaAssignment[]
    moduleReturns: ast.Expression[]
}

export type ParseResult = {
    success: true
    result: LuaSourceInfo
} | {
    success: false
    error: any
}
