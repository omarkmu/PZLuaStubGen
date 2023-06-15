import * as Assert from '../../Assert';

import { RosettaEntity } from '../RosettaEntity';
import { formatName } from '../RosettaUtils';

export class RosettaLuaParameter extends RosettaEntity {
    readonly name: string;
    type: string;
    notes: string | undefined;

    constructor(raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonNull(raw['type'], 'raw[type]');

        this.name = formatName(this.readRequiredString('name'));
        if(raw['type'] != undefined) {
            let type = this.readString('type');
            if (type == undefined) type = 'any';
            this.type = type;
        } else {
            this.type = 'any';
        }
        this.notes = this.readNotes();
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);
        if (raw['type'] != undefined) {
            this.type = this.readRequiredString('type', raw);
        }
    }
}
