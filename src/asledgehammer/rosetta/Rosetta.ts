import fs from 'fs';
import { getFilesFromDir } from './RosettaUtils';
import { RosettaFile } from './RosettaFile';
import { RosettaNamespace } from './RosettaNamespace';

export class Rosetta {
    readonly files: { [path: string]: RosettaFile } = {};
    readonly namespaces: { [name: string]: RosettaNamespace } = {};

    addDirectory(dir: string) {
        if (!fs.existsSync(dir)) {
            throw new Error(`Directory doesn't exist: ${dir}`);
        } else if (!fs.statSync(dir).isDirectory()) {
            throw new Error(`Path isn't directory: ${dir}`);
        }

        const files = getFilesFromDir(dir);

        for (const file of files) {
            console.log(`Reading file: ${file} ..`);

            const json = `${fs.readFileSync(file)}`;

            const rFile = new RosettaFile(this, JSON.parse(json));
            this.files[file] = rFile;
        }
    }
}
