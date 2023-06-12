import * as Assert from '../Assert';

import { RosettaClass } from './RosettaClass';
import { RosettaEntity } from './RosettaEntity';
import { RosettaParameter } from './RosettaParameter';

export class RosettaConstructor extends RosettaEntity {
    readonly parameters: RosettaParameter[] = [];

    readonly clazz: RosettaClass;
    readonly notes: string | undefined;
    readonly deprecated: boolean;
    readonly modifiers: string[];

    constructor(clazz: RosettaClass, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonNull(clazz, 'clazz');
        
        /* PROPERTIES */
        this.clazz = clazz;
        this.notes = this.readNotes();
        this.deprecated = this.readBoolean('deprecated') != null;
        this.modifiers = this.readModifiers();

        /* PARAMETERS */
        if (raw['parameters'] !== undefined) {
            const rawParameters: { [key: string]: any }[] = raw['parameters'];
            for (const rawParameter of rawParameters) {
                const parameter = new RosettaParameter(rawParameter);
                this.parameters.push(parameter);
            }
        }
    }
}
