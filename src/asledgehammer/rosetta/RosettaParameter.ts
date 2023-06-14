import * as Assert from '../Assert';

import { RosettaEntity } from './RosettaEntity';
import { RosettaType } from './RosettaType';
import { formatName } from './RosettaUtils';

export class RosettaParameter extends RosettaEntity {
    readonly type: RosettaType;
    readonly name: string;

    notes: string | undefined;

    constructor(raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonNull(raw['type'], 'raw[type]');

        this.name = formatName(this.readRequiredString('name'));
        this.type = new RosettaType(raw['type']);
        this.parse(raw);
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);
    }
}
