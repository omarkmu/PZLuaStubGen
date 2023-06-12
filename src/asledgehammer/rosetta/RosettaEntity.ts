import * as Assert from '../Assert';

export class RosettaEntity {
    readonly raw: { [key: string]: any };

    constructor(raw: { [key: string]: any }) {
        Assert.assertNonNull(raw, 'raw');
        this.raw = raw;
    }

    readModifiers(): string[] {
        const { raw } = this;
        if (!raw['modifiers']) return [];
        return [...raw['modifiers']];
    }

    readString(id: string): string | undefined {
        const { raw } = this;
        let value = raw[id];
        if (value != null) return `${value}`;
    }

    readNotes(): string | undefined {
        const notes = this.readString('notes');
        if (notes != null) {
            return notes.replace(/\s/g, ' ').replace(/\s\s/g, ' ').trim();
        }
    }

    readRequiredString(id: string): string {
        const { raw } = this;
        if (raw[id] === undefined) {
            throw new Error(`The string with the id '${id}' doesn't exist.`);
        }
        return `${raw[id]}`;
    }

    readBoolean(id: string): boolean | undefined {
        const value = this.raw[id];
        if(value != null) return !!value;
    }

    readRequiredBoolean(id: string): boolean {
        if(this.raw[id] === undefined) {
            throw new Error(`The boolean with the id '${id}' doesn't exist.`);
        }
        return !!this.raw[id];
    }
}
