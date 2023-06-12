import * as Assert from '../Assert';
import { RosettaConstructor } from './RosettaConstructor';

import { RosettaEntity } from './RosettaEntity';
import { RosettaField } from './RosettaField';
import { RosettaMethod } from './RosettaMethod';
import { RosettaMethodCluster } from './RosettaMethodCluster';
import { formatName } from './RosettaUtils';

export class RosettaClass extends RosettaEntity {
    readonly fields: { [name: string]: RosettaField } = {};
    readonly methods: { [name: string]: RosettaMethodCluster } = {};
    readonly constructors: RosettaConstructor[] = [];

    readonly __extends: string | undefined;
    readonly name: string;
    readonly modifiers: string[];
    readonly deprecated: boolean;
    readonly javaType: string;
    readonly notes: string | undefined;

    constructor(name: string, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonEmptyString(name, 'name');

        this.name = formatName(name);
        this.__extends = this.readString('extends');
        this.modifiers = this.readModifiers();
        this.deprecated = this.readBoolean('deprecated') != null;
        this.javaType = this.readRequiredString('javaType');
        this.notes = this.readNotes();

        /* FIELDS */
        if (raw['fields'] !== undefined) {
            const rawFields: { [key: string]: any } = raw['fields'];
            for (const fieldName of Object.keys(rawFields)) {
                const rawField = rawFields[fieldName];
                const field = new RosettaField(fieldName, rawField);
                this.fields[fieldName] = field;
            }
        }

        /* METHODS */
        if (raw['methods'] !== undefined) {
            const rawMethods = raw['methods'];
            for (const rawMethod of rawMethods) {
                const method = new RosettaMethod(rawMethod);
                const { name: methodName } = method;
                let cluster: RosettaMethodCluster;
                if (this.methods[methodName] !== undefined) {
                    cluster = this.methods[methodName];
                } else {
                    cluster = new RosettaMethodCluster(methodName);
                    this.methods[methodName] = cluster;
                }
                cluster.add(method);
            }
        }

        /* CONSTRUCTORS */
        if (raw['constructors'] !== undefined) {
            const list = raw['constructors'];
            for (const rawConstructor of list) {
                const constructor = new RosettaConstructor(this, rawConstructor);
                this.constructors.push(constructor);
            }
        }
    }

    getField(id: string): RosettaField | undefined {
        return this.fields[id];
    }

    getConstructor(...parameterTypes: string[]): RosettaConstructor | undefined {
        if (!this.constructors.length) return undefined;
        for (const conztructor of this.constructors) {
            if (conztructor.parameters.length === parameterTypes.length) {
                let invalid = false;
                for (let index = 0; index < parameterTypes.length; index++) {
                    if (parameterTypes[index] !== conztructor.parameters[index].type.basic) {
                        invalid = true;
                        break;
                    }
                }
                if (invalid) continue;
                return conztructor;
            }
        }
    }

    getMethod(...parameterTypes: string[]): RosettaMethod | undefined {
        if (!this.methods.length) return undefined;
        for (const cluster of Object.values(this.methods)) {
            for (const method of cluster.methods) {
                if (method.parameters.length === parameterTypes.length) {
                    let invalid = false;
                    for (let index = 0; index < parameterTypes.length; index++) {
                        if (parameterTypes[index] !== method.parameters[index].type.basic) {
                            invalid = true;
                            break;
                        }
                    }
                    if (invalid) continue;
                    return method;
                }
            }
        }
    }
}
