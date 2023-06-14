import fs from 'fs';

import { getFilesFromDir } from './RosettaUtils';

import { Rosetta } from './Rosetta';
import { RosettaFile } from './RosettaFile';

export class RosettaPatch {
    readonly files: { [path: string]: RosettaFile } = {};

    readonly path: string;
    readonly name: string;
    readonly version: string;
    readonly valid: boolean;
    readonly rosetta: Rosetta;

    constructor(rosetta: Rosetta, path: string) {
        this.rosetta = rosetta;
        this.path = path;

        const pathPatchJSON = `${path}/patch.json`;

        if (!fs.existsSync(pathPatchJSON)) {
            this.valid = false;
            this.name = '';
            this.version = '';
            return;
        }

        const patch = JSON.parse(fs.readFileSync(pathPatchJSON).toString());

        if (patch['name'] == undefined) {
            this.valid = false;
            this.name = '';
            this.version = '';
            return;
        }

        if (patch['version'] == undefined) {
            this.valid = false;
            this.name = '';
            this.version = '';
            return;
        }

        this.name = `${patch.name}`;
        this.version = `${patch.version}`;
        this.valid = true;
    }

    load() {
        const pathJSON = `${this.path}/json`;

        const loadDir = (dir: string) => {
            const files = getFilesFromDir(dir);
            for (const file of files) {
                const fileStats = fs.statSync(file);

                if (fileStats.isDirectory()) {
                    loadDir(file);
                    continue;
                }

                console.log(`Reading file: ${file} ..`);
                const json = `${fs.readFileSync(file)}`;
                const rFile = new RosettaFile(this.rosetta, JSON.parse(json));
                this.files[file] = rFile;
            }
        };

        if (fs.existsSync(pathJSON)) {
            loadDir(pathJSON);
        }
    }
}
