import * as Assert from '../Assert';
import { RosettaEntity } from './RosettaEntity';
import { RosettaType } from './RosettaType';

export class RosettaParameter extends RosettaEntity {
    readonly type: RosettaType;
    readonly notes: string | undefined;

    constructor(raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonNull(raw['type'], 'raw[type]');

        this.type = new RosettaType(raw['type']);
        this.notes = this.readNotes();
    }
}
