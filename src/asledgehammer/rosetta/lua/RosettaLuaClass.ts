import * as Assert from '../../Assert';

import { formatName } from '../RosettaUtils';
import { RosettaEntity } from '../RosettaEntity';
import { RosettaFunction } from './RosettaFunction';
import { RosettaLuaField } from './RosettaLuaField';
import { RosettaLuaConstructor } from './RosettaLuaConstructor';

export class RosettaLuaClass extends RosettaEntity {
    readonly __extends: string | undefined;
    readonly name: string;

    readonly functions: { [name: string]: RosettaFunction } = {};
    readonly methods: { [name: string]: RosettaFunction } = {};
    readonly fields: { [name: string]: RosettaLuaField } = {};
    __constructor: RosettaLuaConstructor | undefined;
    deprecated: boolean = false;
    notes: string | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');

        this.name = formatName(name);
        this.__extends = this.readString('extends');

        this.notes = this.readNotes();
        this.deprecated = this.readBoolean('deprecated') === true;

        /* (Constructor) */
        if (raw['constructor'] != undefined) {
            const rawConstructor = raw['constructor'];
            this.__constructor = new RosettaLuaConstructor(this, rawConstructor);
        console.log({__constructor: this.__constructor});
        }

        /* (Methods) */
        if (raw['methods'] != undefined) {
            const rawMethods: { [key: string]: any } = raw['methods'];
            for (const name of Object.keys(rawMethods)) {
                const rawMethod = rawMethods[name];
                const method = new RosettaFunction(name, rawMethod);
                this.methods[name] = this.methods[method.name] = method;
            }
        }

        /* (Functions) */
        if (raw['functions'] != undefined) {
            const rawFunctions: { [key: string]: any } = raw['functions'];
            for (const name of Object.keys(rawFunctions)) {
                const rawFunction = rawFunctions[name];
                const func = new RosettaFunction(name, rawFunction);
                this.functions[name] = this.functions[func.name] = func;
            }
        }

        /* (Fields) */
        if (raw['fields'] != undefined) {
            const rawFields: { [key: string]: any } = raw['fields'];
            for (const name of Object.keys(rawFields)) {
                const rawField = rawFields[name];
                const field = new RosettaLuaField(name, rawField);
                this.fields[name] = this.fields[field.name] = field;
            }
        }
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);
        this.deprecated = this.readBoolean('deprecated', raw) === true;

        /* (Constructor) */
        if (raw['constructor'] != undefined) {
            const rawConstructor = raw['constructor'];
            this.__constructor = new RosettaLuaConstructor(this, rawConstructor);
        }

        /* (Methods) */
        if (raw['methods'] != undefined) {
            const rawMethods: { [key: string]: any } = raw['methods'];
            for (const name of Object.keys(rawMethods)) {
                const rawMethod = rawMethods[name];
                let method = this.methods[name];
                if (method == null) {
                    method = new RosettaFunction(name, rawMethod);
                    this.methods[name] = this.methods[method.name] = method;
                } else {
                    console.log(`Overriding class method: ${this.name}.${name}`);
                    method.parse(rawMethod);
                }
            }
        }

        /* (Functions) */
        if (raw['functions'] != undefined) {
            const rawFunctions: { [key: string]: any } = raw['functions'];
            for (const name of Object.keys(rawFunctions)) {
                const rawFunction = rawFunctions[name];
                let func = this.functions[name];
                if (func == null) {
                    const func = new RosettaFunction(name, rawFunction);
                    this.functions[name] = this.functions[func.name] = func;
                } else {
                    console.log(`Overriding class function: ${this.name}.${name}`);
                    func.parse(rawFunction);
                }
            }
        }

        /* (Fields) */
        if (raw['fields'] != undefined) {
            const rawFields: { [key: string]: any } = raw['fields'];
            for (const name of Object.keys(rawFields)) {
                const rawField = rawFields[name];
                let field = this.fields[name];
                if (field == null) {
                    field = new RosettaLuaField(name, rawField);
                    this.fields[name] = this.fields[field.name] = field;
                } else {
                    console.log(`Overriding class field: ${this.name}.${name}`);
                    field.parse(rawField);
                }
            }
        }
    }
}
