import * as Assert from '../Assert';
import { RosettaMethod } from './RosettaMethod';

export class RosettaMethodCluster {
    readonly methods: RosettaMethod[] = [];
    readonly name: string;

    constructor(name: string) {
        Assert.assertNonEmptyString(name, 'name');
        this.name = name;
    }

    add(method: RosettaMethod) {
        if (this.methods.indexOf(method) !== -1) return;
        this.methods.push(method);
    }

    getWithParameters(...parameterNames: string[]): RosettaMethod | undefined {
        for (const method of this.methods) {
            const parameters = method.parameters;
            if (parameterNames.length === parameters.length) {
                if (parameterNames.length === 0) return method;
                let invalid = false;
                for (let i = 0; i < parameters.length; i++) {
                    if (parameters[i].type.basic !== parameterNames[i]) {
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
