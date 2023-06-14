import * as Assert from '../../Assert';

import { RosettaEntity } from '../RosettaEntity';
import { formatName } from '../RosettaUtils';

export class RosettaValue extends RosettaEntity {
    readonly name: string;
    type: string = 'any';
    notes: string | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');
        this.name = formatName(name);
        this.parse(raw);
    }
    
    parse(raw: {[key:string]: any}) {
        /* (Properties) */
        this.type = this.readRequiredString('type');
        this.notes = this.readNotes();
    }
}
