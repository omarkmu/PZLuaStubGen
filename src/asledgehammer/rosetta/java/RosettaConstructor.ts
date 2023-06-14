import * as Assert from '../../Assert';

import { RosettaEntity } from '../RosettaEntity';
import { RosettaParameter } from '../RosettaParameter';

import { RosettaClass } from './RosettaClass';

export class RosettaConstructor extends RosettaEntity {
    readonly parameters: RosettaParameter[] = [];

    readonly clazz: RosettaClass;
    readonly deprecated: boolean;
    readonly modifiers: string[];

    notes: string | undefined;

    constructor(clazz: RosettaClass, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonNull(clazz, 'clazz');

        /* PROPERTIES */
        this.clazz = clazz;
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
        this.notes = this.readNotes(raw);
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);

        /* PARAMETERS */
        if (raw['parameters'] !== undefined) {
            const rawParameters: { [key: string]: any }[] = raw['parameters'];

            /*
             * (To prevent deep-logic issues, check to see if Rosetta's parameters match the length of
             *  the overriding parameters. If not, this is the fault of the patch, not Rosetta)
             */
            if (this.parameters.length !== rawParameters.length) {
                throw new Error(
                    `The class ${this.clazz.name}'s constructor's parameters does not match the parameters to override. (method: ${this.parameters.length}, given: ${rawParameters.length})`
                );
            }

            for (let index = 0; index < rawParameters.length; index++) {
                let parameter = this.parameters[index];
                console.log(`Overriding parameter: ${this.clazz.name}.constructor.${parameter.name} ..`);
                parameter.parse(rawParameters[index]);
            }
        }
    }
}
