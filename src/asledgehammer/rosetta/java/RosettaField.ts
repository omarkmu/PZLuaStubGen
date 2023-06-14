import * as Assert from '../../Assert';
import { RosettaEntity } from '../RosettaEntity';
import { RosettaType } from '../RosettaType';

export class RosettaField extends RosettaEntity {
    readonly name: string;
    readonly modifiers: string[];
    readonly type: RosettaType;
    readonly deprecated: boolean | undefined;
    
    notes: string | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');
        Assert.assertNonNull(raw['type'], 'raw[type]');

        this.name = name;
        this.modifiers = this.readModifiers();
        this.type = new RosettaType(raw['type']);
        this.deprecated = this.readBoolean('deprecated') != null;
        this.notes = this.readNotes(raw);
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);
    }
}
