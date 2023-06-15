import * as Assert from '../../Assert';

import { RosettaEntity } from '../RosettaEntity';

import { RosettaFunction } from './RosettaFunction';
import { RosettaValue } from './RosettaValue';

export class RosettaTable extends RosettaEntity {
    readonly values: { [id: string]: RosettaValue } = {};
    readonly tables: { [id: string]: RosettaTable } = {};
    readonly functions: { [id: string]: RosettaFunction } = {};
    readonly name: string;
    notes: string | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');

        this.name = name;
        this.notes = this.readNotes();

        /* (Tables) */
        if (raw['tables'] !== undefined) {
            const rawTables: { [key: string]: any } = raw['tables'];
            for (const name of Object.keys(rawTables)) {
                const rawTable = rawTables[name];
                const table = new RosettaTable(name, rawTable);
                this.tables[table.name] = this.tables[name] = table;
            }
        }

        /* (Functions) */
        if (raw['functions'] !== undefined) {
            const rawFunctions: { [key: string]: any } = raw['functions'];
            for (const name of Object.keys(rawFunctions)) {
                const rawFunction = rawFunctions[name];
                const func = new RosettaFunction(name, rawFunction);
                this.functions[func.name] = this.functions[name] = func;
            }
        }

        /* (Values) */
        if (raw['values'] !== undefined) {
            const rawValues: { [key: string]: any } = raw['values'];
            for (const name of Object.keys(rawValues)) {
                const rawValue = rawValues[name];
                const value = new RosettaValue(name, rawValue);
                this.values[value.name] = this.values[name] = value;
            }
        }
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);

        /* (Tables) */
        if (raw['tables'] !== undefined) {
            const rawTables: { [key: string]: any } = raw['tables'];
            for (const name of Object.keys(rawTables)) {
                const rawTable = rawTables[name];
                let table = this.tables[name];
                if (table == undefined) {
                    table = new RosettaTable(name, rawTable);
                } else {
                    table.parse(rawTable);
                }
                this.tables[table.name] = this.tables[name] = table;
            }
        }

        /* (Functions) */
        if (raw['functions'] !== undefined) {
            const rawFunctions: { [key: string]: any } = raw['functions'];
            for (const name of Object.keys(rawFunctions)) {
                const rawFunction = rawFunctions[name];
                let func = this.functions[name];
                if (func == undefined) {
                    func = new RosettaFunction(name, rawFunction);
                } else {
                    func.parse(rawFunction);
                }
                this.functions[func.name] = this.functions[name] = func;
            }
        }

        /* (Values) */
        if (raw['values'] !== undefined) {
            const rawValues: { [key: string]: any } = raw['values'];
            for (const name of Object.keys(rawValues)) {
                const rawValue = rawValues[name];
                let value = this.values[name];
                if (value == undefined) {
                    value = new RosettaValue(name, rawValue);
                } else {
                    value.parse(rawValue);
                }
                this.values[value.name] = this.values[name] = value;
            }
        }
    }
}
