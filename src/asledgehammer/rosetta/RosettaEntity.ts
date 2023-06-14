import * as Assert from '../Assert';

export class RosettaEntity {
    readonly raw: { [key: string]: any };

    constructor(raw: { [key: string]: any }) {
        Assert.assertNonNull(raw, 'raw');
        this.raw = raw;
    }

    readModifiers(raw = this.raw): string[] {
        if (!raw['modifiers']) return [];
        return [...raw['modifiers']];
    }

    readString(id: string, raw = this.raw): string | undefined {
        let value = raw[id];
        if (value != null) return `${value}`;
    }

    readNotes(raw = this.raw): string | undefined {
        const notes = this.readString('notes', raw);
        if (notes != null) {
            return notes.replace(/\s/g, ' ').replace(/\s\s/g, ' ').trim();
        }
    }

    readRequiredString(id: string, raw = this.raw): string {
        if (raw[id] === undefined) {
            throw new Error(`The string with the id '${id}' doesn't exist.`);
        }
        return `${raw[id]}`;
    }

    readBoolean(id: string, raw = this.raw): boolean | undefined {
        const value = raw[id];
        if (value != null) return !!value;
    }

    readRequiredBoolean(id: string, raw = this.raw): boolean {
        if (raw[id] === undefined) {
            throw new Error(`The boolean with the id '${id}' doesn't exist.`);
        }
        return !!raw[id];
    }
}
