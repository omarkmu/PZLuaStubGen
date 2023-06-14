import { formatName } from '../RosettaUtils';
import { RosettaEntity } from '../RosettaEntity';
import { RosettaParameter } from '../RosettaParameter';
import { RosettaReturns } from '../RosettaReturns';

export class RosettaMethod extends RosettaEntity {
    readonly parameters: RosettaParameter[] = [];
    readonly returns: RosettaReturns;

    readonly name: string;
    readonly deprecated: boolean;
    readonly modifiers: string[];

    notes: string | undefined;

    constructor(raw: { [key: string]: any }) {
        super(raw);

        /* PROPERTIES */
        this.name = formatName(this.readRequiredString('name'));
        this.deprecated = this.readBoolean('deprecated') != null;
        this.modifiers = this.readModifiers();

        /* PARAMETERS */
        if (raw['parameters'] !== undefined) {
            const rawParameters: { [key: string]: any }[] = raw['parameters'];
            for (let index = 0; index < rawParameters.length; index++) {
                const parameter = new RosettaParameter(rawParameters[index]);
                this.parameters.push(parameter);
            }
        }

        /* RETURNS */
        if (raw['returns'] === undefined) {
            throw new Error(`Method does not have returns definition: ${this.name}`);
        }
        this.returns = new RosettaReturns(raw['returns']);

        this.notes = this.readNotes();
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
                    `The method ${this.name}'s parameters does not match the parameters to override. (method: ${this.parameters.length}, given: ${rawParameters.length})`
                );
            }

            for (let index = 0; index < rawParameters.length; index++) {
                let parameter = this.parameters[index];
                console.log(`Overriding parameter: ${this.name}.${parameter.name} ..`);
                parameter.parse(rawParameters[index]);
            }
        }

        /* RETURNS */
        if (raw['returns'] != undefined) {
            console.log(`Overriding returns: ${this.name} ..`);
            this.returns.parse(raw['returns']);
        }
    }
}
