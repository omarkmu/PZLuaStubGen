import * as Assert from '../../Assert';

import { formatName } from '../RosettaUtils';
import { RosettaEntity } from '../RosettaEntity';
import { RosettaFunction } from './RosettaFunction';

export class RosettaLuaClass extends RosettaEntity {
    readonly __extends: string | undefined;
    readonly name: string;

    readonly functions: { [name: string]: RosettaFunction } = {};
    readonly methods: { [name: string]: RosettaFunction } = {};

    notes: string | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');

        this.name = formatName(name);
        this.__extends = this.readString('extends');

        this.notes = this.readNotes();

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
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);

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
    }
}
