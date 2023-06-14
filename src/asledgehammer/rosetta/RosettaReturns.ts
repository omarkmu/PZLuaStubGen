import * as Assert from '../Assert';

import { RosettaEntity } from "./RosettaEntity";
import { RosettaType } from "./RosettaType";

export class RosettaReturns extends RosettaEntity {

    readonly type: RosettaType;
    notes: string | undefined;

    constructor(raw: {[key: string]: any}) {
        super(raw);

        Assert.assertNonNull(raw['type'], 'raw[type]');

        this.type = new RosettaType(raw['type']);
        this.parse(raw);
    }

    parse(raw: {[key:string]:any}) {
        this.notes = this.readNotes(raw);
    }
}
