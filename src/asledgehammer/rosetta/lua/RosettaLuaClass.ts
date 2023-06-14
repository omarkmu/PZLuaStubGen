import * as Assert from '../../Assert';

import { formatName } from '../RosettaUtils';
import { RosettaEntity } from '../RosettaEntity';

export class RosettaLuaClass extends RosettaEntity {
    readonly __extends: string | undefined;
    readonly name: string;

    notes: string | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');

        this.name = formatName(name);
        this.__extends = this.readString('extends');

        this.notes = this.readNotes();
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);
    }
}
