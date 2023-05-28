import ast from 'luaparse'

import {
    findIdentifierReferences,
    getIdentifierBase,
} from './utils'

import {
    LuaAssignment,
    LuaClass,
    LuaField,
    LuaFunction,
    LuaLocal,
    LuaSourceInfo
} from './types'


type ClassList<T> = {
    [cls: string]: T[]
}
type ClassTable<T> = {
    [cls: string]: {
        [name: string]: T
    }
}


export class ParseContext {
    private aliases: { [name: string]: string }
    private classes: { [cls: string]: LuaClass }

    private locals: { [name: string]: LuaLocal }
    private localAssigns: LuaAssignment[]

    private functions: LuaFunction[]
    private methods: ClassList<LuaFunction>
    private memberFunctions: ClassList<LuaFunction>
    private fields: ClassTable<LuaField>
    private moduleReturns?: ast.Expression[]

    constructor() {
        this.aliases = {}
        this.classes = {}
        this.locals = {}
        this.localAssigns = []
        this.functions = []
        this.methods = {}
        this.memberFunctions = {}
        this.fields = {}
    }

    result(): LuaSourceInfo {
        for (const cls of Object.values(this.classes)) {
            if (this.fields[cls.name]) {
                cls.fields = this.fields[cls.name]
            }

            if (this.memberFunctions[cls.name]) {
                cls.functions = this.memberFunctions[cls.name]
            }

            if (this.methods[cls.name]) {
                cls.methods = this.methods[cls.name]
            }
        }

        return {
            classes: this.classes,
            functions: this.functions,
            locals: this.locals,
            localAssigns: this.localAssigns,
            moduleReturns: this.moduleReturns ?? []
        }
    }

    setModuleReturns(expressions: ast.Expression[]) {
        this.moduleReturns = expressions

        for (const expr of expressions) {
            for (const ref of findIdentifierReferences(expr)) {
                this.addLocalReference(ref)
            }
        }
    }

    addAlias(name: string, alias: string) {
        this.aliases[name] = alias
    }

    addClass(name: string, base?: string, init?: ast.Expression) {
        name = this.resolveAlias(name)

        // ignore local variable reassignments that look like classes
        if (this.hasLocal(name)) return

        if (base) {
            base = this.resolveAlias(base)
        }

        if (this.hasClass(name)) {
            // overwrite base if class is duplicated
            this.classes[name].base = base
            return
        }

        const cls: LuaClass = {
            name,
            base,
            init,
            fields: {},
            methods: [],
            functions: [],
            statics: []
        }

        this.classes[name] = cls

        if (!init) return cls

        // read initializer
        if (init.type === 'TableConstructorExpression') {
            for (const field of init.fields) {
                if (field.type !== 'TableKeyString') continue
                this.addField(name, field.key.name, true)
            }
        }

        for (const ref of findIdentifierReferences(init)) {
            this.addLocalReference(ref)
        }

        return cls
    }

    addField(cls: string, name: string, inInitializer: boolean = false) {
        cls = this.resolveAlias(cls)

        if (!this.fields[cls]) {
            this.fields[cls] = {}
        }

        if (this.fields[cls][name]) return

        const field: LuaField = {
            name,
            inInitializer,
        }

        this.fields[cls][name] = field
        return field
    }

    addFunction(name: string, parameters: string[]) {
        const func: LuaFunction = {
            name,
            parameters,
        }

        this.functions.push(func)
        return func
    }

    addLocal(name: string, init: ast.Expression) {
        this.locals[name] = {
            name,
            init,
            referenced: false,
            dependencies: findIdentifierReferences(init)
        }
    }

    addLocalAssign(local: string, variable: ast.Expression, init: ast.Expression) {
        const localObj = this.locals[local]
        if (!localObj) {
            return
        }

        for (const ref of findIdentifierReferences(init)) {
            localObj.dependencies.push(ref)
        }

        this.localAssigns.push({
            base: local,
            variable,
            init,
        })
    }

    addLocalReference(name: string) {
        const local = this.locals[name]
        if (local) {
            local.referenced = true

            for (const dep of local.dependencies) {
                this.addLocalReference(dep)
            }
        }
    }

    addMemberFunction(cls: string, name: string, parameters: string[], isMethod?: boolean) {
        cls = this.resolveAlias(cls)

        const func: LuaFunction = {
            name,
            parameters,
        }

        const target = isMethod ? this.methods : this.memberFunctions
        if (!target[cls]) {
            target[cls] = []
        }

        target[cls].push(func)
        return func
    }

    addStatic(cls: string, variable: ast.Expression, init: ast.Expression) {
        const clsObj = this.classes[cls]
        if (!clsObj) {
            return
        }

        for (const ref of findIdentifierReferences(init)) {
            this.addLocalReference(ref)
        }

        clsObj.statics.push({
            base: cls,
            variable,
            init,
        })
    }

    addAssignment(variable: ast.IndexExpression | ast.MemberExpression, init: ast.Expression) {
        const ident = getIdentifierBase(variable.base)
        if (!ident) return

        // TODO: unassociated non-local assignment → define global?
        if (this.hasClass(ident.name)) {
            this.addStatic(ident.name, variable, init)
        } else if (this.hasLocal(ident.name)) {
            this.addLocalAssign(ident.name, variable, init)
        }
    }

    hasClass(name: string) {
        return this.classes[name] !== undefined
    }

    hasLocal(name: string) {
        return this.locals[name] !== undefined
    }

    setClass(name: string, cls: LuaClass) {
        this.classes[name] = cls
    }

    setClassBase(name: string, base: string) {
        const cls = this.classes[name]
        if (!cls) return

        cls.base = base
    }

    setClassConstructorType(name: string, constructorType: string) {
        const cls = this.classes[name]
        if (!cls) return

        cls.constructorType = constructorType
    }

    resolveAlias(name: string): string {
        const seen: Record<string, boolean> = {}

        // recursive alias should not occur, but be safe anyway
        while (this.aliases[name] && !seen[name]) {
            if (seen[name]) {
                break
            }

            name = this.aliases[name]
            seen[name] = true
        }

        return name
    }
}
