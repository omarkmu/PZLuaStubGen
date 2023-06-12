import * as Assert from '../Assert';
import { Rosetta } from './Rosetta';
import { RosettaEntity } from './RosettaEntity';
import { RosettaNamespace } from './RosettaNamespace';

export class RosettaFile extends RosettaEntity {
    readonly namespaces: { [name: string]: RosettaNamespace } = {};

    constructor(rosetta: Rosetta, raw: { [key: string]: any }) {
        super(raw);

        Assert.assertNonNull(rosetta, 'rosetta');

        /* NAMESPACES */
        if (raw['namespaces'] !== undefined) {
            const rawNamespaces = raw['namespaces'];
            for (const name of Object.keys(rawNamespaces)) {
                const rawNamespace = rawNamespaces[name];
                let namespace = rosetta.namespaces[name];

                if (namespace == null) {
                    namespace = new RosettaNamespace(name, rawNamespace);
                    rosetta.namespaces[name] = namespace;
                } else {
                    namespace.parse(rawNamespace);
                }

                this.namespaces[name] = namespace;
            }
        }
    }
}
