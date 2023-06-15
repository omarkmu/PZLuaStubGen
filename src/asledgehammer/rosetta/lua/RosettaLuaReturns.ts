import { RosettaEntity } from '../RosettaEntity';

export class RosettaLuaReturns extends RosettaEntity {
    type: string;
    notes: string | undefined;

    constructor(raw: { [key: string]: any }) {
        super(raw);

        if (raw['type'] != undefined) {
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
