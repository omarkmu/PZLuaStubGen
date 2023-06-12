import * as Assert from '../Assert';
import { RosettaClass } from './RosettaClass';
import { RosettaEntity } from './RosettaEntity';

export class RosettaNamespace extends RosettaEntity {
    readonly classes: { [id: string]: RosettaClass } = {};

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');

        this.parse(raw);
    }

    parse(raw: { [key: string]: any }) {
        /* CLASSES */
        for (const clazzName of Object.keys(raw)) {
            if (this.classes[clazzName] !== undefined) {
                throw new Error(`Duplicate class definition: ${clazzName}`);
            }
            const rawClazz = raw[clazzName];
            const clazz = new RosettaClass(clazzName, rawClazz);

            // (Formatted Class Name)
            this.classes[clazz.name] = clazz;
        }
    }
}
