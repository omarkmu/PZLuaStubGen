//#region Helpers

interface SharedLiteralInfo {
    /**
     * A representation of the literal value.
     */
    literal?: string

    /**
     * The type of the literal.
     */
    luaType: LuaType
}

interface BasicLiteralInfo extends SharedLiteralInfo {
    luaType: BasicLuaType
}

interface TableLiteralInfo {
    luaType: 'table'

    /**
     * The ID of the table.
     */
    tableId: string

    /**
     * Fields defined in a table constructor.
     */
    fields: TableField[]
}

interface FunctionLiteralInfo {
    luaType: 'function'

    /**
     * An identifier for an anonymous function.
     */
    functionId: string
}

interface LiteralTypeTagged {
    type: 'literal'
}

export interface AnyLiteralInfo extends SharedLiteralInfo {
    /**
     * Fields defined in a table constructor.
     */
    fields?: TableField[]

    /**
     * An identifier for an anonymous function.
     */
    functionId?: string

    /**
     * An identifier for a table.
     */
    tableId?: string

    parameters?: AnalyzedParameter[]

    returnTypes?: Set<string>[]
}

//#endregion

//#region Expressions

interface LuaLiteral extends AnyLiteralInfo {
    type: 'literal'
}

interface LuaReference {
    type: 'reference'

    id: string

    parameterIndex?: number
}

interface LuaIndex {
    type: 'index'

    base: LuaExpression

    index: LuaExpression
}

interface LuaMember {
    type: 'member'

    base: LuaExpression

    member: string

    indexer: '.' | ':'
}

interface LuaRequire {
    type: 'require'

    module: string
}

interface LuaOperation {
    type: 'operation'

    operator:
        | 'call'
        | '+'
        | '-'
        | '*'
        | '%'
        | '^'
        | '/'
        | '//'
        | '&'
        | '|'
        | '~'
        | '<<'
        | '>>'
        | '..'
        | '~='
        | '=='
        | '<'
        | '<='
        | '>'
        | '>='
        | 'or'
        | 'and'
        | 'not'
        | '-'
        | '~'
        | '#'

    arguments: LuaExpression[]
}

//#endregion

//#region Table Keys

interface StringTableKey {
    type: 'string'

    /**
     * The table key identifier.
     */
    name: string
}

interface LiteralTableKey {
    type: 'literal'

    /**
     * A representation of the literal value of the key.
     */
    literal: string

    /**
     * The Lua type of a literal table key.
     */
    luaType: BasicLuaType

    /**
     * The field name, for string literal fields.
     */
    name?: string
}

/**
 * Represents the numeric key that Lua would assign for a table field without one.
 */
interface AutoTableKey {
    type: 'auto'

    index: number
}

interface ExpressionTableKey {
    type: 'expression'

    expression: LuaExpression
}

type TableKey =
    | StringTableKey
    | AutoTableKey
    | LiteralTableKey
    | ExpressionTableKey

//#endregion

//#region Analyzed

export interface AnalyzedParameter {
    name: string
    types: Set<string>
}

export interface AnalyzedFunction {
    name: string
    parameters: AnalyzedParameter[]
    returnTypes: Set<string>[]
}

export interface AnalyzedField {
    name: string
    types: Set<string>
    expression?: LuaExpression
}

export interface AnalyzedClass {
    name: string
    extends?: string
    deriveName?: string
    generated?: boolean

    fields: AnalyzedField[]
    literalFields: TableField[]
    staticFields: AnalyzedField[]
    functions: AnalyzedFunction[]
    methods: AnalyzedFunction[]
    constructors: AnalyzedFunction[]
    functionConstructors: AnalyzedFunction[]
}

export interface AnalyzedReturn {
    expression?: LuaExpression
    types: Set<string>
}

export interface AnalyzedLocal {
    name: string
    expression: LuaExpression
    types?: Set<string>
}

export interface AnalyzedRequire {
    name: string
    module: string
}

export interface AnalyzedModule {
    id: string
    locals: AnalyzedLocal[]
    functions: AnalyzedFunction[]
    classes: AnalyzedClass[]
    requires: AnalyzedRequire[]
    returns: AnalyzedReturn[]
}

//#endregion

export type BasicLuaType = 'string' | 'number' | 'boolean' | 'nil'
export type LuaType = BasicLuaType | 'table' | 'function'

export type LuaExpression =
    | LuaLiteral
    | LuaReference
    | LuaIndex
    | LuaMember
    | LuaOperation
    | LuaRequire

export interface TableField {
    /**
     * The table key.
     */
    key: TableKey

    /**
     * The table value.
     */
    value: LuaExpression

    /**
     * Types to emit with the table field.
     */
    types?: Set<string>
}
