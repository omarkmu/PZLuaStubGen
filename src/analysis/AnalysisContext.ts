import ast from 'luaparse'
import { LuaScope } from '../scopes'
import { LuaHelpers } from '../base'
import {
    AssignmentItem,
    FunctionDefinitionItem,
    LuaExpression,
    LuaExpressionInfo,
    LuaLiteral,
    LuaOperation,
    LuaType,
    RequireAssignmentItem,
    ResolvedClassInfo,
    ResolvedFunctionInfo,
    ResolvedScopeItem,
    ResolvedReturnInfo,
    TableField,
    UsageItem,
    FunctionInfo,
    TableInfo,
    LuaReference,
    AnalyzedParameter,
    AnalyzedFunction,
    AnalyzedModule,
    AnalyzedClass,
    AnalyzedField,
    AnalyzedReturn,
    ResolvedModule,
    TableKey,
    AnalyzedLocal,
} from './types'

/**
 * Shared context for analysis of multiple Lua files.
 */
export class AnalysisContext {
    protected nextTableIndex: number = 1
    protected nextFunctionIndex: number = 1

    protected aliasMap: Map<string, Set<string>>

    /**
     * Definitions for items.
     */
    protected definitions: Map<string, LuaExpressionInfo[]>

    /**
     * Expression types inferred by usage.
     */
    protected usageTypes: Map<LuaExpression, Set<string>>

    /**
     * Maps function IDs to info about the function they describe.
     */
    protected idToFunctionInfo: Map<string, FunctionInfo>

    /**
     * Maps table IDs to info about the table they describe.
     */
    protected idToTableInfo: Map<string, TableInfo>

    /**
     * Maps function declarations to function IDs.
     */
    protected functionToID: Map<ast.FunctionDeclaration, string>

    /**
     * Maps table constructor expressions to table IDs.
     */
    protected tableToID: Map<ast.TableConstructorExpression, string>

    /**
     * Maps parameter IDs to function IDs.
     */
    protected parameterToFunctionId: Map<string, string>

    /**
     * Maps file identifiers to resolved modules.
     */
    protected modules: Map<string, ResolvedModule>

    constructor() {
        this.aliasMap = new Map()
        this.tableToID = new Map()
        this.functionToID = new Map()
        this.idToTableInfo = new Map()
        this.idToFunctionInfo = new Map()
        this.parameterToFunctionId = new Map()
        this.definitions = new Map()
        this.usageTypes = new Map()
        this.modules = new Map()
    }

    /**
     * Adds an assignment to the list of definitions or fields.
     */
    addAssignment(
        scope: LuaScope,
        item: AssignmentItem | FunctionDefinitionItem | RequireAssignmentItem,
    ) {
        scope.addItem(item)
        const lhs =
            item.type === 'functionDefinition' ? item.expression : item.lhs

        // anonymous functions have no assignment
        if (!lhs) {
            return
        }

        let rhs: LuaExpression
        switch (item.type) {
            case 'assignment':
            case 'requireAssignment':
                rhs = item.rhs
                break

            case 'functionDefinition':
                rhs = item.literal
                break
        }

        const index = item.type === 'assignment' ? item.index : undefined
        switch (lhs.type) {
            case 'reference':
                if (item.type !== 'requireAssignment') {
                    const tableId = this.tryAddPartialItem(
                        scope,
                        item,
                        lhs,
                        rhs,
                    )

                    if (tableId) {
                        rhs = {
                            type: 'literal',
                            luaType: 'table',
                            tableId,
                        }
                    }
                }

                this.addDefinition(scope, lhs.id, rhs, index)
                break

            case 'index':
                const indexBase = [
                    ...this.resolveTypes({ expression: lhs.base }),
                ]

                if (indexBase.length !== 1) {
                    break
                }

                const resolved = this.resolveBasicLiteral(lhs.index)
                if (!resolved || !resolved.literal) {
                    break
                }

                const key = this.getLiteralKey(
                    resolved.literal,
                    resolved.luaType,
                )

                this.addField(scope, indexBase[0], key, rhs, index)
                break

            case 'member':
                let isInstance = false
                const memberBase = [
                    ...this.resolveTypes({ expression: lhs.base }),
                ].filter((x) => {
                    if (!x.startsWith('@self') && !x.startsWith('@instance')) {
                        return true
                    }

                    isInstance = true
                    return false
                })

                if (memberBase.length === 1) {
                    // ignore __index in instances
                    if (isInstance && lhs.member === '__index') {
                        break
                    }

                    const key = this.getLiteralKey(lhs.member)
                    this.addField(
                        scope,
                        memberBase[0],
                        key,
                        rhs,
                        index,
                        isInstance,
                    )
                }

                break

            // operation or literal should not occur directly in lhs
        }
    }

    finalizeModules(): Map<string, AnalyzedModule> {
        const modules = new Map<string, AnalyzedModule>()

        for (const [id, mod] of this.modules) {
            const localReferences = this.getReferences(mod)

            const classes: AnalyzedClass[] = []
            for (const cls of mod.classes) {
                classes.push(this.finalizeClass(cls, localReferences))
            }

            const functions: AnalyzedFunction[] = []
            for (const func of mod.functions) {
                functions.push(
                    this.finalizeFunction(func.functionId, func.name),
                )
            }

            const returns: AnalyzedReturn[] = []
            for (const ret of mod.returns) {
                returns.push(this.finalizeReturn(ret, localReferences))
            }

            const locals: AnalyzedLocal[] = []
            for (const [id, count] of localReferences) {
                if (count <= 1) {
                    continue
                }

                const name = mod.scope.localIdToName(id)
                if (!name) {
                    continue
                }

                const defs = this.definitions.get(id) ?? []
                const [expression, types] = this.finalizeDefinitions(
                    defs,
                    localReferences,
                )

                const local: AnalyzedLocal = {
                    name,
                    expression: expression ?? {
                        type: 'literal',
                        luaType: 'nil',
                        literal: 'nil',
                    },
                }

                if (types) {
                    local.types = types
                }

                locals.push(local)
            }

            modules.set(id, {
                id: id,
                locals,
                classes,
                functions,
                returns,
            })
        }

        return modules
    }

    /**
     * Gets the ID to use for a function.
     */
    getFunctionID(expr: ast.FunctionDeclaration, name?: string): string {
        let id = this.functionToID.get(expr)
        if (!id) {
            const count = this.nextFunctionIndex++
            id = `@function(${count})` + (name ? `[${name}]` : '')

            this.functionToID.set(expr, id)
        }

        return id
    }

    /**
     * Gets the ID to use for a table.
     */
    getTableID(expr: ast.TableConstructorExpression, name?: string): string {
        let id = this.tableToID.get(expr)
        if (!id) {
            id = this.newTableID(name)
            this.tableToID.set(expr, id)
        }

        return id
    }

    /**
     * Resolves the types of the analysis items for a module.
     */
    resolveItems(scope: LuaScope): ResolvedScopeItem {
        // collect usage information
        for (const item of scope.items) {
            if (item.type !== 'usage') {
                continue
            }

            this.addUsage(item, scope)
        }

        // resolve classes, functions, and returns
        const classes: ResolvedClassInfo[] = []
        const functions: ResolvedFunctionInfo[] = []

        for (const item of scope.items) {
            switch (item.type) {
                case 'partial':
                    if (item.classInfo) {
                        classes.push(item.classInfo)
                    }

                    if (item.functionInfo) {
                        functions.push(item.functionInfo)
                    }

                    break

                case 'returns':
                case 'resolved':
                    const funcInfo = this.getFunctionInfo(item.id)

                    const min = funcInfo.minReturns ?? Number.MAX_VALUE
                    funcInfo.minReturns = Math.min(min, item.returns.length)

                    for (let i = 0; i < item.returns.length; i++) {
                        funcInfo.returnTypes[i] ??= new Set()
                        funcInfo.returnExpressions[i] ??= new Set()

                        let types: Set<string>
                        if (item.type === 'returns') {
                            const ret = item.returns[i]

                            funcInfo.returnExpressions[i].add(ret)
                            types = this.remapBooleans(
                                this.resolveTypes({ expression: ret }),
                            )
                        } else {
                            types = item.returns[i].types
                        }

                        types.forEach((x) => funcInfo.returnTypes[i].add(x))
                    }

                    if (item.type === 'resolved') {
                        item.functions.forEach((x) => functions.push(x))
                        item.classes.forEach((x) => classes.push(x))
                    }

                    break
            }
        }

        // mark returns exceeding the minimum as nullable
        for (const [, info] of this.idToFunctionInfo) {
            const min = info.minReturns
            if (!min || info.returnTypes.length <= min) {
                continue
            }

            for (let i = min; i < info.returnTypes.length; i++) {
                info.returnTypes[i].add('nil')
            }
        }

        const funcInfo = this.getFunctionInfo(scope.id)
        const returns = funcInfo.returnTypes.map(
            (returnTypes, i): ResolvedReturnInfo => {
                return {
                    types: returnTypes,
                    expressions: funcInfo.returnExpressions[i] ?? new Set(),
                }
            },
        )

        return {
            type: 'resolved',
            id: scope.id,
            classes,
            functions,
            returns,
        }
    }

    setAliasMap(map: Map<string, Set<string>>) {
        this.aliasMap = map
    }

    /**
     * Sets up basic info for a function.
     */
    setFunctionInfo(
        functionId: string,
        scope: LuaScope,
        node: ast.FunctionDeclaration,
        identExpr: LuaExpression | undefined,
    ): string[] {
        const [parameters, parameterTypes, returnTypes] = this.checkClassMethod(
            scope,
            node,
            identExpr,
        )

        for (const param of node.parameters) {
            const paramId = scope.getLocalId(
                param.type === 'Identifier' ? param.name : '...',
            )

            if (paramId) {
                parameters.push(paramId)
            }
        }

        const info = this.getFunctionInfo(functionId)
        info.parameters = parameters
        info.parameterNames = parameters.map((x) => scope.localIdToName(x) ?? x)
        info.parameterTypes = parameterTypes
        info.returnTypes = returnTypes
        info.identifierExpression = identExpr

        for (const param of parameters) {
            this.parameterToFunctionId.set(param, functionId)
        }

        return parameters
    }

    /**
     * Modifies types based on a setmetatable call.
     */
    setMetatable(scope: LuaScope, lhs: LuaExpression, meta: LuaExpression) {
        if (lhs.type !== 'reference') {
            return
        }

        const name = scope.localIdToName(lhs.id)
        if (!name) {
            return
        }

        if (meta.type === 'literal') {
            const fields = meta.fields

            // { X = Y }
            if (fields?.length !== 1) {
                return
            }

            // { __index = X }
            const field = fields[0]
            if (field.key.type !== 'string' || field.key.name !== '__index') {
                return
            }

            meta = field.value
        }

        // get metatable type
        const metaTypes = [...this.resolveTypes({ expression: meta })].filter(
            (x) => !x.startsWith('@self'),
        )

        const resolvedMeta = metaTypes[0]
        if (metaTypes.length !== 1 || !resolvedMeta.startsWith('@table')) {
            return
        }

        // check that metatable is a class
        const metaInfo = this.getTableInfo(resolvedMeta)
        if (!metaInfo.className) {
            return
        }

        // get lhs types
        const lhsTypes = [...this.resolveTypes({ expression: lhs })]
        if (lhsTypes.length === 0) {
            return
        }

        if (lhsTypes.find((x) => !x.startsWith('@table'))) {
            // unknown lhs → don't treat as instance
            return
        }

        for (const resolvedLhs of lhsTypes) {
            const lhsInfo = this.getTableInfo(resolvedLhs)
            // don't copy class fields
            if (lhsInfo.className) {
                continue
            }

            // copy table fields to class instance fields
            lhsInfo.definitions.forEach((list, key) => {
                let fieldDefs = metaInfo.definitions.get(key)
                if (!fieldDefs) {
                    fieldDefs = []
                    metaInfo.definitions.set(key, fieldDefs)
                }

                for (const info of list) {
                    fieldDefs.push({
                        expression: info.expression,
                        index: info.index,
                        instance: true,
                        functionLevel: !scope.id.startsWith('@module'),
                    })
                }
            })
        }

        // mark lhs as class instance
        const newId = scope.addInstance(name)
        this.definitions.set(newId, [
            {
                expression: {
                    type: 'literal',
                    luaType: 'table',
                    tableId: resolvedMeta,
                },
            },
        ])
    }

    /**
     * Sets resolved information about a module.
     */
    setModule(id: string, scope: LuaScope, resolved: ResolvedScopeItem) {
        const mod = resolved as ResolvedModule
        mod.scope = scope

        this.modules.set(id, mod)
    }

    /**
     * Sets the fields used to define a table.
     */
    setTableLiteralFields(tableId: string, fields: TableField[]) {
        const info = this.getTableInfo(tableId)
        info.literalFields = fields

        for (const field of fields) {
            const key = field.key

            let literalKey: string | undefined
            switch (key.type) {
                case 'string':
                    literalKey = this.getLiteralKey(key.name)
                    break

                case 'literal':
                    literalKey = this.getLiteralKey(key.literal, key.luaType)
                    break

                case 'auto':
                    literalKey = key.index.toString()
                    break

                // can't resolve expressions
            }

            if (!literalKey) {
                continue
            }

            let fieldDefs = info.definitions.get(literalKey)
            if (!fieldDefs) {
                fieldDefs = []
                info.definitions.set(literalKey, fieldDefs)
            }

            fieldDefs.push({ expression: field.value })
        }
    }

    protected addDefinition(
        scope: LuaScope,
        id: string,
        expression: LuaExpression,
        index?: number,
    ) {
        let defs = this.definitions.get(id)
        if (!defs) {
            defs = []
            this.definitions.set(id, defs)
        }

        defs.push({
            expression,
            index,
            functionLevel: !scope.id.startsWith('@module'),
        })
    }

    protected addField(
        scope: LuaScope,
        id: string,
        field: string,
        expression: LuaExpression,
        index?: number,
        instance?: boolean,
    ) {
        if (!id.startsWith('@table')) {
            return
        }

        const info = this.getTableInfo(id)

        let fieldDefs = info.definitions.get(field)
        if (!fieldDefs) {
            fieldDefs = []
            info.definitions.set(field, fieldDefs)
        }

        fieldDefs.push({
            expression,
            index,
            instance,
            functionLevel: !scope.id.startsWith('@module'),
        })
    }

    /**
     * Adds information about the usage of an expression.
     */
    protected addUsage(item: UsageItem, scope: LuaScope) {
        let usageTypes = this.usageTypes.get(item.expression)
        if (!usageTypes) {
            usageTypes = new Set([
                'boolean',
                'function',
                'number',
                'string',
                'table',
            ])

            this.usageTypes.set(item.expression, usageTypes)
        }

        if (item.supportsConcatenation) {
            // string | number
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('table')
        }

        if (item.supportsIndexing || item.supportsLength) {
            // table | string
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('number')
        }

        if (item.supportsIndexAssignment) {
            // table
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('number')
            usageTypes.delete('string')
        }

        if (item.supportsMath || item.inNumericFor) {
            // number
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('string')
            usageTypes.delete('table')
        }

        // handle function argument analysis
        if (item.arguments === undefined) {
            return
        }

        // function
        usageTypes.delete('boolean')
        usageTypes.delete('number')
        usageTypes.delete('string')
        usageTypes.delete('table')

        const types = [...this.resolveTypes({ expression: item.expression })]

        const id = types[0]
        if (types.length !== 1 || !id.startsWith('@function')) {
            return
        }

        const funcInfo = this.getFunctionInfo(id)
        const parameterTypes = funcInfo.parameterTypes

        // add passed arguments to inferred parameter types
        for (let i = 0; i < item.arguments.length; i++) {
            parameterTypes[i] ??= new Set()
            this.resolveTypes({ expression: item.arguments[i] }).forEach((x) =>
                parameterTypes[i].add(x),
            )
        }

        // if arguments aren't passed for a parameter, add nil
        for (let i = item.arguments.length; i < parameterTypes.length; i++) {
            parameterTypes[i] ??= new Set()
            parameterTypes[i].add('nil')
        }
    }

    protected checkClassMethod(
        scope: LuaScope,
        node: ast.FunctionDeclaration,
        identExpr: LuaExpression | undefined,
    ): [string[], Set<string>[], Set<string>[]] {
        const parameters: string[] = []
        const parameterTypes: Set<string>[] = []
        const returnTypes: Set<string>[] = []

        if (identExpr?.type !== 'member') {
            return [parameters, parameterTypes, returnTypes]
        }

        if (identExpr.indexer === '.') {
            const base = identExpr.base
            if (base.type !== 'reference') {
                return [parameters, parameterTypes, returnTypes]
            }

            const name = identExpr.member

            // non-special methods don't need special handling
            if (name !== 'new' && name !== 'getInstance') {
                return [parameters, parameterTypes, returnTypes]
            }

            // setmetatable instances should be handled elsewhere
            if (this.checkHasSetmetatableInstance(node)) {
                return [parameters, parameterTypes, returnTypes]
            }

            const baseName = scope.localIdToName(base.id) ?? base.id

            // all classes which use the `.new` pattern also set a local `self`
            // this will be either a table or a call to the base class `.new`
            let classTable: ast.TableConstructorExpression | undefined
            let baseClass: string | undefined
            for (const child of node.body) {
                // local self = ...
                if (child.type !== 'LocalStatement') {
                    continue
                }

                const name = child.variables[0]?.name
                if (name !== 'self') {
                    continue
                }

                // local self = {}
                const init = child.init[0]
                if (init.type === 'TableConstructorExpression') {
                    classTable = init
                    break
                }

                // local self = X.new()
                const base =
                    init.type === 'CallExpression' ? init.base : undefined

                if (base?.type !== 'MemberExpression') {
                    continue
                }

                if (base.identifier.name !== 'new') {
                    continue
                }

                const memberBase = base.base
                if (memberBase.type !== 'Identifier') {
                    continue
                }

                baseClass = memberBase.name
                break
            }

            if (baseClass || classTable) {
                const tableId = classTable
                    ? this.getTableID(classTable)
                    : this.newTableID()

                const name = `${baseName}_Instance`
                const tableInfo = this.getTableInfo(tableId)
                if (tableInfo.className) {
                    // already has a class
                    return [parameters, parameterTypes, returnTypes]
                }

                tableInfo.className = name
                scope.items.push({
                    type: 'partial',
                    classInfo: {
                        name,
                        tableId,
                        base: baseClass ? `${baseClass}_Instance` : undefined,
                        generated: true,
                    },
                })

                if (!classTable) {
                    // to identify the table when it's being defined
                    scope.classTableId = tableId
                }

                // mark the instance in the base class
                const resolvedBaseTypes = [
                    ...this.resolveTypes({
                        expression: base,
                    }),
                ]

                const resolvedBase =
                    resolvedBaseTypes.length === 1
                        ? resolvedBaseTypes[0]
                        : undefined

                if (resolvedBase?.startsWith('@table')) {
                    const baseTableInfo = this.getTableInfo(resolvedBase)
                    if (baseTableInfo.className) {
                        baseTableInfo.instanceName = name
                        baseTableInfo.instanceId = tableId
                    }
                }

                returnTypes.push(new Set([tableId]))
            }

            return [parameters, parameterTypes, returnTypes]
        }

        const selfId = scope.getLocalId('self') ?? scope.addSelfParameter()
        parameters.push(selfId)

        const identBase = identExpr.base
        if (identBase.type !== 'reference') {
            return [parameters, parameterTypes, returnTypes]
        }

        const types = this.resolveTypes({ expression: identBase })
        if (types.size === 0) {
            return [parameters, parameterTypes, returnTypes]
        }

        parameterTypes.push(types)

        // assume Class:new(...) returns Class
        if (identExpr.member === 'new') {
            returnTypes.push(types)

            const tableId = [...types][0]

            // `:new` method without class → create class
            if (tableId.startsWith('@table')) {
                const tableInfo = this.getTableInfo(tableId)
                if (!tableInfo.className) {
                    const baseId = identBase.id
                    const name = scope.localIdToName(baseId) ?? baseId
                    scope.items.push({
                        type: 'partial',
                        classInfo: {
                            name,
                            tableId,
                        },
                    })
                }
            }
        }

        return [parameters, parameterTypes, returnTypes]
    }

    protected checkClassTable(
        expr: LuaExpression,
        scope: LuaScope,
    ): string | undefined {
        if (expr.type === 'operation' && expr.operator === 'call') {
            return
        }

        const typeSet = this.resolveTypes({ expression: expr })

        // expect unambiguous type
        if (typeSet.size !== 1) {
            return
        }

        // expect table
        const rhs = [...typeSet][0]
        if (!rhs.startsWith('@table')) {
            return
        }

        return rhs
    }

    protected checkDeriveCall(
        expr: LuaExpression,
    ): [string, string] | undefined {
        if (expr.type !== 'operation' || expr.operator !== 'call') {
            return
        }

        // expect single argument (base + arg count)
        if (expr.arguments.length !== 2) {
            return
        }

        // expect string
        const arg = expr.arguments[1]
        if (arg.type !== 'literal' || arg.luaType !== 'string') {
            return
        }

        const type = LuaHelpers.readLuaString(arg.literal ?? '')
        if (!type) {
            return
        }

        // expect X:Y(...)
        const callBase = expr.arguments[0]
        if (callBase?.type !== 'member' || callBase.indexer !== ':') {
            return
        }

        // expect X:derive(...)
        if (callBase.member !== 'derive') {
            return
        }

        // expect base:derive(...)
        const base = callBase.base
        if (base.type !== 'reference' || base.id.startsWith('@')) {
            return
        }

        // found derive; return base class name
        return [base.id, type]
    }

    protected checkHasSetmetatableInstance(node: ast.FunctionDeclaration) {
        for (const child of node.body) {
            // check for a setmetatable call
            if (child.type !== 'CallStatement') {
                continue
            }

            if (child.expression.type !== 'CallExpression') {
                continue
            }

            const base = child.expression.base
            if (base.type !== 'Identifier' || base.name !== 'setmetatable') {
                continue
            }

            // check for a metatable
            const meta = child.expression.arguments[1]
            if (!meta) {
                continue
            }

            // identifier → using table as index
            if (meta.type === 'Identifier') {
                return true
            }

            if (meta.type !== 'TableConstructorExpression') {
                continue
            }

            // table → check for an __index field
            for (const field of meta.fields) {
                if (field.type !== 'TableKeyString') {
                    continue
                }

                if (field.key.name === '__index') {
                    return true
                }
            }
        }

        return false
    }

    /**
     * Checks whether the given expression has already been seen.
     * This will attempt to use known types, and will otherwise add `unknown`.
     */
    protected checkTypeResolutionCycle(
        info: LuaExpressionInfo,
        types: Set<string>,
        seen: Map<LuaExpressionInfo, Set<string>>,
    ): boolean {
        const existing = seen.get(info)
        if (!existing) {
            return false
        }

        existing.forEach((x) => types.add(x))
        return true
    }

    protected finalizeClass(
        cls: ResolvedClassInfo,
        refs: Map<string, number>,
    ): AnalyzedClass {
        const info = this.getTableInfo(cls.tableId)

        const fields: AnalyzedField[] = []
        const literalFields: TableField[] = []
        const staticFields: AnalyzedField[] = []
        const methods: AnalyzedFunction[] = []
        const functions: AnalyzedFunction[] = []
        const constructors: AnalyzedFunction[] = []
        const functionConstructors: AnalyzedFunction[] = []

        const literalKeys = new Set<string>()
        for (const field of info.literalFields) {
            let key: TableKey
            switch (field.key.type) {
                case 'auto':
                    key = field.key
                    literalKeys.add(`[${field.key.index}]`)
                    break

                case 'string':
                    key = field.key
                    literalKeys.add(field.key.name)
                    break

                case 'literal':
                    key = field.key
                    literalKeys.add(`[${field.key.literal}]`)
                    break

                case 'expression':
                    const expr = this.finalizeExpression(
                        field.key.expression,
                        refs,
                    )

                    key = {
                        type: 'expression',
                        expression: expr,
                    }

                    break
            }

            literalFields.push({
                key,
                value: this.finalizeExpression(field.value, refs),
            })
        }

        for (const [field, expressions] of info.definitions) {
            const functionExpr = expressions.find((x) => {
                return (
                    (cls.generated || !x.functionLevel) &&
                    !x.instance &&
                    x.expression
                )
            })?.expression

            let addedFunction = false
            if (functionExpr?.type === 'literal' && functionExpr.functionId) {
                const id = functionExpr.functionId
                const funcInfo = this.getFunctionInfo(id)
                const identExpr = funcInfo.identifierExpression

                let name: string | undefined
                let indexer: string | undefined
                if (identExpr?.type === 'member') {
                    // function X.Y(...)
                    name = identExpr.member
                    indexer = identExpr.indexer
                } else {
                    // X.Y = function(...)
                    name = LuaHelpers.getLuaFieldKey(field)
                }

                const func = this.finalizeFunction(id, name)
                if (name === 'new') {
                    let ret = func.returnTypes[0]
                    if (!ret) {
                        ret = new Set()
                        func.returnTypes[0] = ret
                    }

                    ret.clear()
                    ret.add(info.instanceName ?? cls.name)

                    const target =
                        indexer === ':' ? constructors : functionConstructors

                    target.push(func)
                } else {
                    const target = indexer === ':' ? methods : functions
                    target.push(func)
                }

                addedFunction = true
            }

            const name = LuaHelpers.getLuaFieldKey(field)
            const instanceExprs = expressions.filter((x) => x.instance)
            if (instanceExprs.length > 0) {
                const instanceTypes = new Set<string>()

                for (const expr of instanceExprs) {
                    this.resolveTypes(expr).forEach((x) => instanceTypes.add(x))
                }

                const types = this.finalizeTypes(instanceTypes)

                // function collision → add only if there are other types
                if (addedFunction) {
                    const checkTypes = new Set(types)
                    checkTypes.delete('function')
                    checkTypes.delete('nil')

                    if (checkTypes.size === 0) {
                        continue
                    }
                }

                fields.push({
                    name,
                    types,
                })

                continue
            }

            const staticExprs = expressions.filter((x) => !x.instance)
            if (staticExprs.length > 0) {
                if (addedFunction || literalKeys.has(name)) {
                    continue
                }

                const staticTypes = new Set<string>()

                for (const expr of staticExprs) {
                    this.resolveTypes(expr).forEach((x) => staticTypes.add(x))
                }

                const moduleLevelDef = expressions.find((x) => !x.functionLevel)
                if (!moduleLevelDef) {
                    // no module-level def → assume optional
                    staticTypes.add('nil')
                }

                let expression: LuaExpression | undefined
                const types = this.finalizeTypes(staticTypes)

                // only rewrite module-level definitions
                if (moduleLevelDef) {
                    if (staticExprs.length === 1) {
                        expression = moduleLevelDef.expression
                    } else if (types.size === 1) {
                        switch ([...types][0]) {
                            case 'nil':
                            case 'boolean':
                            case 'string':
                            case 'number':
                                expression = moduleLevelDef.expression
                                break
                        }
                    }

                    if (expression) {
                        expression = this.finalizeExpression(expression, refs)
                    }
                }

                staticFields.push({
                    name,
                    types,
                    expression,
                })
            }
        }

        return {
            name: cls.name,
            extends: cls.base,
            deriveName: cls.deriveName,
            generated: cls.generated,
            fields,
            literalFields,
            staticFields,
            functions,
            methods,
            constructors,
            functionConstructors,
        }
    }

    protected finalizeDefinitions(
        defs: LuaExpressionInfo[],
        refs: Map<string, number>,
        seen?: Map<string, LuaExpression | null>,
    ): [LuaExpression | undefined, Set<string> | undefined] {
        let value: LuaExpression | undefined

        // one def → try to rewrite as literal
        // unless the one def was defined in a function
        if (defs.length === 1 && !defs[0].functionLevel) {
            value = this.finalizeExpression(defs[0].expression, refs, seen)
        }

        const includeTypes =
            !value || (value.type === 'reference' && refs.get(value.id) !== 1)

        let types: Set<string> | undefined
        if (includeTypes) {
            // no defs, multiple defs, or failed reference resolution → resolve types
            types = new Set()
            for (const def of defs) {
                this.resolveTypes(def).forEach((x) => types!.add(x))
            }

            // no defs at module level → assume optional
            if (!defs.find((x) => !x.functionLevel)) {
                types.add('nil')
            }

            types = this.finalizeTypes(types)

            // local functions will include the type annotations
            if (value?.type === 'reference') {
                types.delete('function')
                if (types.size === 0) {
                    types = undefined
                }
            }
        }

        return [value, types]
    }

    protected finalizeExpression(
        expression: LuaExpression,
        refs: Map<string, number>,
        seen?: Map<string, LuaExpression | null>,
    ): LuaExpression {
        seen ??= new Map()

        switch (expression.type) {
            case 'reference':
                // remove internal ID information
                const id = expression.id
                const start = id.indexOf('[')
                const sanitizedExpression: LuaExpression = {
                    type: 'reference',
                    id:
                        start !== -1
                            ? id.slice(start + 1, -1)
                            : id.startsWith('@self')
                              ? 'self'
                              : id,
                }

                if (refs.get(expression.id) !== 1) {
                    return sanitizedExpression
                }

                const literal = this.resolveBasicLiteral(expression)
                if (literal) {
                    return literal
                }

                const types = [...this.resolveTypes({ expression })]
                const type = types[0]

                if (types.length === 1 && type.startsWith('@table')) {
                    return this.finalizeExpression(
                        {
                            type: 'literal',
                            luaType: 'table',
                            tableId: type,
                        },
                        refs,
                        seen,
                    )
                } else if (types.length === 1 && type.startsWith('@function')) {
                    return this.finalizeExpression(
                        {
                            type: 'literal',
                            luaType: 'function',
                            functionId: type,
                        },
                        refs,
                        seen,
                    )
                }

                // failed to resolve → emit the local
                refs.set(expression.id, 2)
                return sanitizedExpression

            case 'literal':
                const tableId = expression.tableId
                if (tableId) {
                    const tableLiteral = this.finalizeTable(tableId, refs, seen)
                    if (tableLiteral) {
                        return tableLiteral
                    }
                }

                const funcId = expression.functionId
                if (funcId) {
                    const info = this.finalizeFunction(funcId, '@field')
                    return {
                        type: 'literal',
                        luaType: 'function',
                        parameters: info.parameters,
                        returnTypes: info.returnTypes,
                    }
                }

                return {
                    type: 'literal',
                    luaType: expression.luaType,
                    literal: expression.literal,
                    fields: expression.fields,
                    parameters: expression.parameters,
                    returnTypes: expression.returnTypes,
                }

            case 'operation':
                return {
                    type: 'operation',
                    operator: expression.operator,
                    arguments: expression.arguments.map((x) =>
                        this.finalizeExpression(x, refs, seen),
                    ),
                }

            case 'member':
                return {
                    ...expression,
                    base: this.finalizeExpression(expression.base, refs),
                }

            case 'index':
                return {
                    type: 'index',
                    base: this.finalizeExpression(expression.base, refs),
                    index: this.finalizeExpression(expression.index, refs),
                }

            default:
                return expression
        }
    }

    protected finalizeFunction(id: string, name: string): AnalyzedFunction {
        const info = this.getFunctionInfo(id)
        const isMethod = info.identifierExpression?.type === 'member'

        const parameters: AnalyzedParameter[] = []
        for (let i = 0; i < info.parameters.length; i++) {
            const name = info.parameterNames[i]
            if (isMethod && name === 'self') {
                continue
            }

            const paramTypes = info.parameterTypes[i] ?? new Set()
            const types = this.finalizeTypes(paramTypes)

            parameters.push({
                name,
                types,
            })
        }

        const returns: Set<string>[] = []
        for (let i = 0; i < info.returnTypes.length; i++) {
            const expressions = info.returnExpressions[i] ?? []

            const types = new Set<string>()
            for (const expr of expressions) {
                this.resolveTypes({ expression: expr }).forEach((x) =>
                    types.add(x),
                )
            }

            info.returnTypes[i].forEach((x) => types.add(x))
            returns.push(this.finalizeTypes(types))
        }

        return {
            name,
            parameters,
            returnTypes: returns,
        }
    }

    protected finalizeReturn(
        ret: ResolvedReturnInfo,
        refs: Map<string, number>,
    ): AnalyzedReturn {
        let expression: LuaExpression | undefined
        const types = new Set<string>()

        if (ret.expressions.size === 1) {
            // one expression → include for rewrite
            expression = [...ret.expressions][0]
        } else if (ret.expressions.size === 0) {
            // no expressions → use computed types
            ret.types.forEach((x) => types.add(x))
        }

        // use value directly if possible
        if (expression) {
            expression = this.finalizeExpression(expression, refs)
        }

        for (const expr of ret.expressions) {
            this.resolveTypes({ expression: expr }).forEach((x) => types.add(x))
        }

        return {
            types: this.finalizeTypes(types),
            expression,
        }
    }

    protected finalizeTable(
        id: string,
        refs: Map<string, number>,
        seen?: Map<string, LuaExpression | null>,
    ): LuaExpression | undefined {
        seen ??= new Map()
        if (seen.has(id)) {
            return seen.get(id) ?? undefined
        }

        seen.set(id, null)
        const info = this.getTableInfo(id)

        const fields: TableField[] = []

        let nextAutoKey = 1
        for (const [defKey, defs] of info.definitions) {
            const fieldKey = LuaHelpers.getLuaFieldKey(defKey)
            const [value, types] = this.finalizeDefinitions(defs, refs, seen)

            let key: TableKey
            if (fieldKey.startsWith('[')) {
                const innerKey = fieldKey.slice(1, -1)
                const numKey = Number.parseInt(innerKey)

                if (numKey === nextAutoKey) {
                    nextAutoKey++
                    key = {
                        type: 'auto',
                        index: numKey,
                    }
                } else {
                    let luaType: LuaType
                    if (!isNaN(numKey)) {
                        luaType = 'number'
                    } else if (innerKey === 'true' || innerKey === 'false') {
                        luaType = 'boolean'
                    } else if (innerKey.startsWith('"')) {
                        luaType = 'string'
                    } else {
                        luaType = 'nil'
                    }

                    key = {
                        type: 'literal',
                        luaType,
                        literal: innerKey,
                    }
                }
            } else {
                key = {
                    type: 'string',
                    name: fieldKey,
                }
            }

            const field: TableField = {
                key,
                value: value ?? {
                    type: 'literal',
                    luaType: 'nil',
                    literal: 'nil',
                },
            }

            if (types !== undefined) {
                field.types = types
            }

            fields.push(field)
        }

        const expression: LuaExpression = {
            type: 'literal',
            luaType: 'table',
            fields: fields,
        }

        seen.set(id, expression)

        return expression
    }

    protected finalizeTypes(types: Set<string>): Set<string> {
        const finalizedTypes = new Set(
            [...types]
                .map((type) => {
                    if (type === 'true' || type === 'false') {
                        return 'boolean'
                    }

                    if (type.startsWith('@table')) {
                        const tableInfo = this.getTableInfo(type)
                        return tableInfo.className ?? 'table'
                    }

                    if (type.startsWith('@function')) {
                        return 'function'
                    }

                    // discard IDs
                    if (type.startsWith('@')) {
                        return
                    }

                    return type
                })
                .filter((x) => x !== undefined),
        )

        return finalizedTypes
    }

    /**
     * Gets function info from a function ID, creating it if it doesn't exist.
     */
    protected getFunctionInfo(id: string): FunctionInfo {
        let info = this.idToFunctionInfo.get(id)
        if (info) {
            return info
        }

        info = {
            id,
            parameters: [],
            parameterNames: [],
            parameterTypes: [],
            returnTypes: [],
            returnExpressions: [],
        }

        this.idToFunctionInfo.set(id, info)
        return info
    }

    /**
     * Gets the literal key to use for a table field mapping.
     */
    protected getLiteralKey(key: string, type?: LuaType) {
        let internal: string | undefined
        if (!type) {
            internal = key
        } else if (type === 'string') {
            internal = LuaHelpers.readLuaString(key)
        }

        if (!internal) {
            return key
        }

        return '"' + internal.replaceAll('"', '\\"') + '"'
    }

    protected getReferences(mod: ResolvedModule): Map<string, number> {
        const stack: [LuaExpression, number][] = []
        for (const cls of mod.classes) {
            const info = this.getTableInfo(cls.tableId)
            for (const def of info.definitions.values()) {
                stack.push(
                    ...def.map((x): [LuaExpression, number] => [
                        x.expression,
                        0,
                    ]),
                )
            }

            for (const field of info.literalFields) {
                if (field.key.type === 'expression') {
                    stack.push([field.key.expression, 0])
                }
            }
        }

        for (const ret of mod.returns) {
            if (ret.expressions.size === 1) {
                // expression will only be included directly if there's only one
                stack.push([[...ret.expressions][0], 0])
            }
        }

        const refCount = new Map<string, number>()
        while (stack.length > 0) {
            const [expression, defaultRefs] = stack.pop()!

            switch (expression.type) {
                case 'reference':
                    const id = expression.id
                    if (!mod.scope.localIdToName(id)) {
                        break
                    }

                    const count = refCount.get(id) ?? defaultRefs
                    refCount.set(id, count + 1)

                    const resolvedTypes = this.resolveTypes({ expression })
                    for (const resolved of resolvedTypes) {
                        if (!resolved.startsWith('@table')) {
                            continue
                        }

                        stack.push([
                            {
                                type: 'literal',
                                luaType: 'table',
                                tableId: resolved,
                            },
                            defaultRefs,
                        ])
                    }

                    break

                case 'index':
                    // indexed → count as multiple refs
                    stack.push([expression.base, 1])
                    stack.push([expression.index, defaultRefs])
                    break

                case 'member':
                    // indexed → count as multiple refs
                    stack.push([expression.base, 1])
                    break

                case 'operation':
                    for (let i = 0; i < expression.arguments.length; i++) {
                        // count call base as multiple refs
                        const newDefault =
                            expression.operator === 'call' && i === 0
                                ? 1
                                : defaultRefs

                        stack.push([expression.arguments[i], newDefault])
                    }

                    break

                case 'literal':
                    const tableId = expression.tableId
                    if (!tableId) {
                        break
                    }

                    const info = this.getTableInfo(tableId)
                    for (const expressions of info.definitions.values()) {
                        // if there are multiple defs, count as multiple refs
                        const count = expressions.length === 1 ? defaultRefs : 1

                        expressions.forEach((x) =>
                            stack.push([x.expression, count]),
                        )
                    }

                    break
            }
        }

        return refCount
    }

    /**
     * Gets table info from a table ID, creating it if it doesn't exist.
     */
    protected getTableInfo(id: string): TableInfo {
        let info = this.idToTableInfo.get(id)
        if (info) {
            return info
        }

        info = {
            id,
            literalFields: [],
            definitions: new Map(),
        }

        this.idToTableInfo.set(id, info)
        return info
    }

    /**
     * Gets the truthiness of a set of types.
     * If the truth cannot be determined, returns `undefined`
     * @param types
     */
    protected getTruthiness(types: Set<string>): boolean | undefined {
        let hasTruthy = false
        let hasFalsy = false

        for (const type of types) {
            if (type === 'boolean') {
                // can't determine truthiness of `boolean`
                hasTruthy = true
                hasFalsy = true
                break
            }

            if (type === 'false' || type === 'nil') {
                hasFalsy = true
            } else {
                hasTruthy = true
            }
        }

        if (hasTruthy === hasFalsy) {
            return
        } else {
            return hasTruthy
        }
    }

    /**
     * Checks whether an expression is a literal or an
     * operation containing only literals.
     */
    protected isLiteralOperation(expr: LuaExpression) {
        if (expr.type === 'literal') {
            return true
        }

        const stack: LuaExpression[] = [expr]
        while (stack.length > 0) {
            const expression = stack.pop()!

            if (expression.type === 'operation') {
                if (expression.operator === 'call') {
                    return false
                }

                expression.arguments.forEach((x) => stack.push(x))
            } else if (expression.type !== 'literal') {
                return false
            }
        }

        return true
    }

    /**
     * Narrows possible expression types based on usage.
     */
    protected narrowTypes(expr: LuaExpression, types: Set<string>) {
        // no narrowing necessary
        if (types.size <= 1) {
            return
        }

        // no narrowing is possible
        const usage = this.usageTypes.get(expr)
        if (!usage || usage.size === 0 || usage.size === 5) {
            return
        }

        // filter possible types to narrowed types
        const narrowed = [...types].filter((type) => {
            if (type.startsWith('@function') && usage.has('function')) {
                return true
            } else if (type.startsWith('@table') && usage.has('table')) {
                return true
            } else if (usage.has(type)) {
                return true
            }

            return false
        })

        // oops, too much narrowing
        if (narrowed.length === 0) {
            return
        }

        types.clear()
        narrowed.forEach((x) => types.add(x))
    }

    protected newTableID(name?: string): string {
        const count = this.nextTableIndex++
        return `@table(${count})` + (name ? `[${name}]` : '')
    }

    protected remapBooleans(types: Set<string>) {
        const remapped = [...types].map((x) =>
            x === 'true' || x === 'false' ? 'boolean' : x,
        )

        types.clear()
        remapped.forEach((x) => types.add(x))

        return types
    }

    /**
     * Resolves an expression into a basic literal, if it can be determined
     * to be resolvable to one.
     */
    protected resolveBasicLiteral(
        expression: LuaExpression,
        seen?: Map<LuaExpressionInfo, Set<string>>,
    ): LuaLiteral | undefined {
        const stack: LuaExpressionInfo[] = []

        stack.push({ expression })

        while (stack.length > 0) {
            const info = stack.pop()!
            const expr = info.expression

            let key: string
            let tableInfo: TableInfo
            let fieldDefs: LuaExpressionInfo[] | undefined
            switch (expr.type) {
                case 'literal':
                    if (
                        expr.luaType !== 'table' &&
                        expr.luaType !== 'function'
                    ) {
                        return expr
                    }

                    return

                case 'reference':
                    fieldDefs = this.definitions.get(expr.id)
                    if (fieldDefs && fieldDefs.length === 1) {
                        stack.push(fieldDefs[0])
                    }

                    break

                case 'member':
                    const memberBase = [
                        ...this.resolveTypes({ expression: expr.base }),
                    ]

                    if (memberBase.length !== 1) {
                        break
                    }

                    tableInfo = this.getTableInfo(memberBase[0])
                    key = this.getLiteralKey(expr.member)
                    fieldDefs = tableInfo.definitions.get(key) ?? []

                    if (fieldDefs.length === 1) {
                        stack.push(fieldDefs[0])
                    }

                    break

                case 'index':
                    const indexBase = [
                        ...this.resolveTypes({ expression: expr.base }),
                    ]

                    if (indexBase.length !== 1) {
                        break
                    }

                    const index = this.resolveBasicLiteral(expr.index, seen)

                    if (!index || !index.literal) {
                        break
                    }

                    tableInfo = this.getTableInfo(indexBase[0])
                    key = this.getLiteralKey(index.literal, index.luaType)
                    fieldDefs = tableInfo.definitions.get(key) ?? []

                    if (fieldDefs.length === 1) {
                        stack.push(fieldDefs[0])
                    }

                    break

                case 'operation':
                    const types = [
                        ...this.resolveTypes({ expression: expr }, seen),
                    ]

                    if (types.length !== 1) {
                        break
                    }

                    // only resolve known booleans
                    if (types[0] === 'true' || types[0] === 'false') {
                        return {
                            type: 'literal',
                            luaType: 'boolean',
                            literal: types[0],
                        }
                    }

                    break
            }
        }

        return
    }

    /**
     * Resolves the possible types of a table field.
     * @param types The set of types for the base.
     * @param scope The relevant scope.
     * @param field A string representing the field.
     * @param isIndex Whether this is an index operation. If it is, `field` will be interpreted as a literal key.
     */
    protected resolveFieldTypes(
        types: Set<string>,
        field: string,
        isIndex: boolean = false,
        seen?: Map<LuaExpressionInfo, Set<string>>,
    ): Set<string> {
        const fieldTypes = new Set<string>()
        if (types.size === 0) {
            return fieldTypes
        }

        for (const type of types) {
            if (!type.startsWith('@table')) {
                continue
            }

            const info = this.getTableInfo(type)
            const literalKey = isIndex ? field : this.getLiteralKey(field)
            const fieldDefs = info.definitions.get(literalKey) ?? []

            for (const def of fieldDefs) {
                this.resolveTypes(def, seen).forEach((x) => fieldTypes.add(x))
            }
        }

        return fieldTypes
    }

    /**
     * Resolves the possible types for the result of an operation.
     * @param op The operation expression.
     * @param scope The relevant scope.
     * @param index For call operations, this is used to determine which return type to use.
     */
    protected resolveOperationTypes(
        op: LuaOperation,
        seen?: Map<LuaExpressionInfo, Set<string>>,
        index: number = 1,
    ): Set<string> {
        const types = new Set<string>()

        let lhs: LuaExpression | undefined
        let rhs: LuaExpression | undefined
        let lhsTypes: Set<string> | undefined
        let rhsTypes: Set<string> | undefined
        let lhsTruthy: boolean | undefined

        switch (op.operator) {
            case 'call':
                const func = op.arguments[0]
                if (!func) {
                    break
                }

                const resolvedFuncTypes = this.resolveTypes(
                    { expression: func },
                    seen,
                )

                if (!resolvedFuncTypes || resolvedFuncTypes.size !== 1) {
                    break
                }

                const resolvedFunc = [...resolvedFuncTypes][0]
                if (!resolvedFunc.startsWith('@function')) {
                    break
                }

                // handle constructors
                if (
                    func.type === 'member' &&
                    func.member === 'new' &&
                    func.base.type === 'reference'
                ) {
                    const resolvedBaseTypes = this.resolveTypes({
                        expression: func.base,
                    })

                    const base = [...resolvedBaseTypes][0]
                    if (
                        resolvedBaseTypes.size === 1 &&
                        base.startsWith('@table')
                    ) {
                        const info = this.getTableInfo(base)
                        types.add(info.instanceId ?? base)
                        break
                    }
                }

                const funcInfo = this.getFunctionInfo(resolvedFunc)
                const returns = funcInfo.returnTypes[index - 1]
                if (!returns) {
                    types.add('nil')
                    break
                }

                returns.forEach((x) => types.add(x))
                break

            case '..':
                types.add('string')
                break

            case '~=':
            case '==':
            case '<':
            case '<=':
            case '>':
            case '>=':
                types.add('boolean')
                break

            case '+':
            case '-':
            case '*':
            case '%':
            case '^':
            case '/':
            case '//':
            case '&':
            case '|':
            case '~':
            case '<<':
            case '>>':
            case '#':
                types.add('number')
                break

            case 'not':
                const argTypes = this.resolveTypes(
                    { expression: op.arguments[0] },
                    seen,
                )

                const truthy = this.isLiteralOperation(op.arguments[0])
                    ? this.getTruthiness(argTypes)
                    : undefined

                if (truthy === undefined) {
                    // can't determine truthiness; use boolean
                    types.add('boolean')
                    break
                } else {
                    types.add(truthy ? 'false' : 'true')
                    break
                }

            case 'or':
                lhs = op.arguments[0]
                rhs = op.arguments[1]

                lhsTypes = this.resolveTypes({ expression: lhs }, seen)
                rhsTypes = this.resolveTypes({ expression: rhs }, seen)

                // X and Y or Z → use Y & Z (ternary special case)
                if (lhs.type === 'operation' && lhs.operator === 'and') {
                    lhsTypes = this.resolveTypes(
                        { expression: lhs.arguments[1] },
                        seen,
                    )
                }

                lhsTruthy = this.isLiteralOperation(lhs)
                    ? this.getTruthiness(lhsTypes)
                    : undefined

                rhsTypes.forEach((x) => types.add(x))

                // lhs falsy → use only rhs types
                if (lhsTruthy === false) {
                    break
                }

                // lhs truthy or undetermined → use both
                lhsTypes.forEach((x) => types.add(x))
                break

            case 'and':
                lhs = op.arguments[0]
                rhs = op.arguments[1]

                lhsTypes = this.resolveTypes({ expression: lhs }, seen)
                rhsTypes = this.resolveTypes({ expression: rhs }, seen)

                lhsTruthy = this.isLiteralOperation(lhs)
                    ? this.getTruthiness(lhsTypes)
                    : undefined

                if (lhsTruthy === true) {
                    // lhs truthy → use rhs types
                    rhsTypes.forEach((x) => types.add(x))
                } else if (lhsTruthy === false) {
                    // lhs falsy → use lhs types
                    lhsTypes.forEach((x) => types.add(x))
                } else {
                    // undetermined → use both
                    lhsTypes.forEach((x) => types.add(x))
                    rhsTypes.forEach((x) => types.add(x))
                }

                break
        }

        return types
    }

    /**
     * Resolves the potential types of an expression.
     */
    protected resolveTypes(
        info: LuaExpressionInfo,
        seen?: Map<LuaExpressionInfo, Set<string>>,
    ): Set<string> {
        seen ??= new Map()
        const types = new Set<string>()

        if (this.checkTypeResolutionCycle(info, types, seen)) {
            return types
        }

        seen.set(info, new Set())

        const expression = info.expression
        let typesToAdd: Set<string>
        switch (expression.type) {
            case 'literal':
                typesToAdd = new Set()
                if (expression.literal === 'true') {
                    typesToAdd.add('true')
                } else if (expression.literal === 'false') {
                    typesToAdd.add('false')
                } else if (expression.tableId) {
                    typesToAdd.add(expression.tableId)
                } else if (expression.functionId) {
                    typesToAdd.add(expression.functionId)
                } else {
                    typesToAdd.add(expression.luaType)
                }

                break

            case 'operation':
                typesToAdd = this.resolveOperationTypes(
                    expression,
                    seen,
                    info.index,
                )

                break

            case 'reference':
                typesToAdd = new Set()
                const id = expression.id
                const isParam =
                    id.startsWith('@parameter') || id.startsWith('@self')

                // add IDs as types for later resolution
                if (
                    isParam ||
                    id.startsWith('@function') ||
                    id.startsWith('@instance')
                ) {
                    typesToAdd.add(id)
                }

                if (isParam) {
                    const funcId = this.parameterToFunctionId.get(id)
                    if (!funcId) {
                        break
                    }

                    const funcInfo = this.getFunctionInfo(funcId)
                    for (let i = 0; i < funcInfo.parameters.length; i++) {
                        if (id !== funcInfo.parameters[i]) {
                            continue
                        }

                        funcInfo.parameterTypes[i]?.forEach((x) =>
                            typesToAdd.add(x),
                        )

                        break
                    }
                }

                const defs = this.definitions.get(id)
                if (!defs) {
                    break
                }

                for (const def of defs) {
                    this.resolveTypes(def, seen).forEach((x) =>
                        typesToAdd.add(x),
                    )
                }

                break

            case 'member':
                const memberBaseTypes = this.resolveTypes(
                    { expression: expression.base, index: info.index },
                    seen,
                )

                typesToAdd = this.resolveFieldTypes(
                    memberBaseTypes,
                    expression.member,
                    false,
                    seen,
                )

                break

            case 'index':
                const indexBaseTypes = this.resolveTypes(
                    { expression: expression.base, index: info.index },
                    seen,
                )

                const index = this.resolveBasicLiteral(expression.index, seen)

                if (!index || !index.literal) {
                    typesToAdd = new Set()
                    break
                }

                const key = this.getLiteralKey(index.literal, index.luaType)
                typesToAdd = this.resolveFieldTypes(
                    indexBaseTypes,
                    key,
                    true,
                    seen,
                )

                break

            case 'require':
                const moduleName = expression.module

                // unknown → check for alias
                let mod = this.modules.get(moduleName)
                if (!mod) {
                    let alias = this.aliasMap.get(moduleName)
                    const firstAlias = alias ? [...alias][0] : undefined
                    if (firstAlias) {
                        mod = this.modules.get(firstAlias)
                    }
                }

                // still unknown
                if (!mod) {
                    typesToAdd = new Set()
                    break
                }

                const targetIdx = info.index ?? 1
                typesToAdd = mod.returns[targetIdx - 1]?.types ?? new Set()

                break
        }

        this.narrowTypes(expression, typesToAdd)

        typesToAdd.forEach((x) => types.add(x))
        seen.set(info, types)

        if (types.has('true') && types.has('false')) {
            types.delete('true')
            types.delete('false')
            types.add('boolean')
        }

        return types
    }

    protected tryAddPartialItem(
        scope: LuaScope,
        item: AssignmentItem | FunctionDefinitionItem,
        lhs: LuaReference,
        rhs: LuaExpression,
    ): string | undefined {
        if (scope.type === 'function') {
            // TODO: what is this for?
            if (scope.localIdToName(lhs.id) !== 'self') {
                return
            }

            return scope.classTableId
        }

        // module and module-level blocks, excluding functions
        if (!scope.id.startsWith('@module')) {
            return
        }

        // global function definition
        if (item.type === 'functionDefinition') {
            // ignore local functions
            if (item.isLocal) {
                return
            }

            scope.items.push({
                type: 'partial',
                functionInfo: {
                    name: lhs.id,
                    functionId: item.id,
                },
            })

            return
        }

        // ignore locals
        if (lhs.id.startsWith('@')) {
            return
        }

        const [base, deriveName] = this.checkDeriveCall(rhs) ?? []

        const tableId = !base
            ? this.checkClassTable(rhs, scope)
            : this.newTableID()

        // global table or derive call → class
        if (tableId) {
            const tableInfo = this.getTableInfo(tableId)
            if (tableInfo.className) {
                // already has a class
                return
            }

            tableInfo.className = lhs.id
            scope.items.push({
                type: 'partial',
                classInfo: {
                    name: lhs.id,
                    tableId,
                    base,
                    deriveName,
                },
            })

            return tableId
        }

        // global function assignment
        const rhsTypes = [...this.resolveTypes({ expression: item.rhs })]

        if (rhsTypes.length !== 1) {
            return
        }

        const rhsType = rhsTypes[0]
        if (rhsType.startsWith('@function')) {
            scope.items.push({
                type: 'partial',
                functionInfo: {
                    name: lhs.id,
                    functionId: rhsType,
                },
            })
        }
    }
}
