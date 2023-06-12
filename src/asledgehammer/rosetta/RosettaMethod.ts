import { RosettaEntity } from './RosettaEntity';
import { RosettaParameter } from './RosettaParameter';
import { RosettaReturns } from './RosettaReturns';
import { formatName } from './RosettaUtils';

export class RosettaMethod extends RosettaEntity {
    readonly parameters: RosettaParameter[] = [];
    readonly returns: RosettaReturns;

    readonly name: string;
    readonly notes: string | undefined;
    readonly deprecated: boolean;
    readonly modifiers: string[];

    constructor(raw: { [key: string]: any }) {
        super(raw);

        /* PROPERTIES */
        this.name = formatName(this.readRequiredString('name'));
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

        /* RETURNS */
        if (raw['returns'] === undefined) {
            throw new Error(`Method does not have returns definition: ${this.name}`);
        }
        this.returns = new RosettaReturns(raw['returns']);
    }
}
