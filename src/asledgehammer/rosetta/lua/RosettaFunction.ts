import * as Assert from '../../Assert';

import { formatName } from '../RosettaUtils';
import { RosettaEntity } from '../RosettaEntity';
import { RosettaLuaParameter } from './RosettaLuaParameter';
import { RosettaLuaReturns } from './RosettaLuaReturns';

export class RosettaFunction extends RosettaEntity {
    readonly parameters: RosettaLuaParameter[] = [];
    returns: RosettaLuaReturns | undefined;

    readonly name: string;
    notes: string | undefined;
    deprecated: boolean | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');
        this.name = formatName(name);
        this.deprecated = this.readBoolean('deprecated') != null;
  
        /* PROPERTIES */
        this.notes = this.readNotes();
    }

    parse(raw: { [key: string]: any }) {

        /* PROPERTIES */
        this.notes = this.readNotes(raw);

        /* PARAMETERS */
        if (raw['parameters'] !== undefined) {
            const rawParameters: { [key: string]: any }[] = raw['parameters'];
            for (const rawParameter of rawParameters) {
                const parameter = new RosettaLuaParameter(rawParameter);
                this.parameters.push(parameter);
            }
        }

        /* RETURNS */
        if (raw['returns'] === undefined) {
            throw new Error(`Method does not have returns definition: ${this.name}`);
        }
        this.returns = new RosettaLuaReturns(raw['returns']);
    }
}
