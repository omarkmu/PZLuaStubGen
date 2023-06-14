import * as Assert from '../../Assert';

import { RosettaEntity } from '../RosettaEntity';

import { RosettaClass } from './RosettaClass';

export class RosettaNamespace extends RosettaEntity {
    readonly classes: { [id: string]: RosettaClass } = {};
    readonly name: string;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');
        this.name = name;
        this.parse(raw);
    }

    parse(raw: { [key: string]: any }) {
        /* (Classes) */
        for (const clazzName of Object.keys(raw)) {

            const rawClazz = raw[clazzName];
            let clazz = this.classes[clazzName];
            if(clazz == undefined) {
                clazz = new RosettaClass(clazzName, rawClazz);
            } else {
                console.log(`Overriding class: ${clazz.name} ..`);
                clazz.parse(rawClazz);
            }

            if (this.classes[clazzName] !== undefined) {
                throw new Error(`Duplicate class definition: ${clazzName}`);
            }

            /* (Formatted Class Name) */
            this.classes[clazz.name] = this.classes[clazzName] = clazz;
        }
    }
}
