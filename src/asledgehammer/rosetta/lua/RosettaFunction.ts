import * as Assert from '../../Assert';

import { formatName } from '../RosettaUtils';
import { RosettaEntity } from '../RosettaEntity';
import { RosettaParameter } from '../RosettaParameter';
import { RosettaReturns } from '../RosettaReturns';

export class RosettaFunction extends RosettaEntity {
    readonly parameters: RosettaParameter[] = [];
    returns: RosettaReturns | undefined;

    readonly name: string;
    notes: string | undefined;
    deprecated: boolean | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');
        this.name = formatName(name);
        this.deprecated = this.readBoolean('deprecated') != null;
        this.parse(raw);
    }

    parse(raw: { [key: string]: any }) {
        /* PROPERTIES */
        this.notes = this.readNotes(raw);

        /* PARAMETERS */
        if (raw['parameters'] !== undefined) {
            const rawParameters: { [key: string]: any }[] = raw['parameters'];
            for (const rawParameter of rawParameters) {
                const parameter = new RosettaParameter(rawParameter);
                this.parameters.push(parameter);
            }
        }

        /* RETURNS */
        if (raw['returns'] === undefined) {
            throw new Error(`Method does not have returns definition: ${this.name}`);
        }
        this.returns = new RosettaReturns(raw['returns']);
    }
}
