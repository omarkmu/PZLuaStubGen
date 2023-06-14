import * as Assert from '../../Assert';

import { formatName } from '../RosettaUtils';
import { RosettaEntity } from '../RosettaEntity';

import { RosettaConstructor } from './RosettaConstructor';
import { RosettaMethodCluster } from './RosettaMethodCluster';
import { RosettaMethod } from './RosettaMethod';
import { RosettaField } from './RosettaField';

export class RosettaClass extends RosettaEntity {
    readonly fields: { [name: string]: RosettaField } = {};
    readonly methods: { [name: string]: RosettaMethodCluster } = {};
    readonly constructors: RosettaConstructor[] = [];

    readonly __extends: string | undefined;
    readonly name: string;
    readonly modifiers: string[];
    readonly deprecated: boolean;
    readonly javaType: string;

    notes: string | undefined;

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
                let field = new RosettaField(fieldName, rawField);
                this.fields[field.name] = this.fields[fieldName] = field;
            }
        }

        /* METHODS */
        if (raw['methods'] !== undefined) {
            const rawMethods = raw['methods'];
            for (const rawMethod of rawMethods) {
                const method = new RosettaMethod(rawMethod);
                const { name: methodName } = method;
                let cluster: RosettaMethodCluster;
                if (this.methods[methodName] == undefined) {
                    cluster = new RosettaMethodCluster(methodName);
                    this.methods[methodName] = cluster;
                } else {
                    cluster = this.methods[methodName];
                }
                cluster.add(method);
            }
        }

        /* CONSTRUCTORS */
        if (raw['constructors'] !== undefined) {
            const rawConstructors = raw['constructors'];
            for (const rawConstructor of rawConstructors) {
                this.constructors.push(new RosettaConstructor(this, rawConstructor));
            }
        }
    }

    parse(raw: { [key: string]: any }) {
        this.notes = this.readNotes(raw);

        /* FIELDS */
        if (raw['fields'] !== undefined) {
            const rawFields: { [key: string]: any } = raw['fields'];
            for (const fieldName of Object.keys(rawFields)) {
                const rawField = rawFields[fieldName];
                let field = this.fields[fieldName];
                if (field == undefined) {
                    throw new Error(`Cannot find field in class: ${this.name}.${fieldName}`);
                }
                console.log(`Overriding field: ${field.name} ..`);
                field.parse(rawField);
            }
        }

        /* METHODS */
        if (raw['methods'] !== undefined) {
            const rawMethods = raw['methods'];
            for (const rawMethod of rawMethods) {
                const method = new RosettaMethod(rawMethod);
                const { name: methodName } = method;
                let cluster: RosettaMethodCluster = this.methods[methodName];
                if (this.methods[methodName] == undefined) {
                    throw new Error(`Cannot find method in class: ${this.name}.${methodName}`);
                }
                cluster.add(method);
            }
        }

        /* CONSTRUCTORS */
        if (raw['constructors'] !== undefined) {
            const rawConstructors = raw['constructors'];
            for (const rawConstructor of rawConstructors) {
                const rawParameterCount =
                    rawConstructor['parameters'] != undefined ? rawConstructor['parameters'].length : 0;
                let foundConstructor: RosettaConstructor | undefined;
                for (let index = 0; index < this.constructors.length; index++) {
                    const nextConstructor = this.constructors[index];
                    const nextParameterCount = nextConstructor.parameters.length;
                    if (rawParameterCount === nextParameterCount) {
                        foundConstructor = nextConstructor;
                        break;
                    }
                }
                if (foundConstructor == undefined) {
                    throw new Error(`Class Constructor ${this.name} not found with param count: ${rawParameterCount}`);
                }
                foundConstructor.parse(rawConstructor);
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
