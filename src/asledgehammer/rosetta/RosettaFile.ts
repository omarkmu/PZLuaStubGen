import * as Assert from '../Assert';

import { Rosetta } from './Rosetta';
import { RosettaEntity } from './RosettaEntity';

import { RosettaNamespace } from './java/RosettaNamespace';
import { RosettaFunction } from './lua/RosettaFunction';
import { RosettaTable } from './lua/RosettaTable';
import { RosettaValue } from './lua/RosettaValue';
import { RosettaLuaClass } from './lua/RosettaLuaClass';

export class RosettaFile extends RosettaEntity {
    /* (Java) */
    readonly namespaces: { [name: string]: RosettaNamespace } = {};

    /* (Lua) */
    readonly luaClasses: { [name: string]: RosettaLuaClass } = {};
    readonly tables: { [name: string]: RosettaTable } = {};
    readonly functions: { [name: string]: RosettaFunction } = {};
    readonly values: { [name: string]: RosettaValue } = {};

    constructor(rosetta: Rosetta, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonNull(rosetta, 'rosetta');

        /* NAMESPACES */
        if (raw['namespaces'] !== undefined) {
            const rawNamespaces = raw['namespaces'];
            for (const name of Object.keys(rawNamespaces)) {
                const rawNamespace = rawNamespaces[name];
                let namespace = rosetta.namespaces[name];

                if (namespace == null) {
                    namespace = new RosettaNamespace(name, rawNamespace);
                    rosetta.namespaces[name] = namespace;
                } else {
                    console.log(`Overriding namespace: ${namespace.name} ..`);
                    namespace.parse(rawNamespace);
                }

                this.namespaces[name] = namespace;
            }
        }

        /* (Tables) */
        if (raw['tables'] !== undefined) {
            const rawTables = raw['tables'];
            for (const name of Object.keys(rawTables)) {
                const rawTable = rawTables[name];
                let table = rosetta.tables[name];

                if (table == null) {
                    table = new RosettaTable(name, rawTable);
                    rosetta.tables[table.name] = rawTable;
                } else {
                    console.log(`Overriding table: ${table.name} ..`);
                    table.parse(rawTable);
                }

                this.tables[name] = table;
            }
        }

        /* (Functions) */
        if (raw['functions'] !== undefined) {
            const rawFunctions = raw['functions'];
            for (const name of Object.keys(rawFunctions)) {
                const rawFunction = rawFunctions[name];
                let func = rosetta.functions[name];

                if (func == null) {
                    func = new RosettaFunction(name, rawFunction);
                    rosetta.functions[func.name] = rawFunction;
                } else {
                    console.log(`Overriding function: ${func.name} ..`);
                    func.parse(rawFunction);
                }

                this.functions[func.name] = func;
            }
        }

        /* (Values) */
        if (raw['values'] !== undefined) {
            const rawValues = raw['values'];
            for (const name of Object.keys(rawValues)) {
                const rawValue = rawValues[name];
                let value = rosetta.values[name];
                if (value == null) {
                    value = new RosettaValue(name, rawValue);
                    rosetta.values[value.name] = rawValue;
                } else {
                    console.log(`Overriding value: ${value.name} ..`);
                    value.parse(rawValue);
                }

                this.values[value.name] = value;
            }
        }

        /* (Lua Classes) */
        if (raw['luaClasses'] !== undefined) {
            const rawLuaClasses = raw['luaClasses'];
            for (const name of Object.keys(rawLuaClasses)) {
                const rawLuaClass = rawLuaClasses[name];
                let luaClass = rosetta.luaClasses[name];
                if (luaClass == null) {
                    console.log('Loading Lua Class: ' + name);
                    luaClass = new RosettaLuaClass(name, rawLuaClass);
                    rosetta.luaClasses[luaClass.name] = rawLuaClass;
                } else {
                    console.log(`Overriding Lua Class: ${luaClass.name} ..`);
                    luaClass.parse(rawLuaClass);
                }

                this.luaClasses[luaClass.name] = luaClass;
            }
        }
    }
}
