import fs from 'fs';

import { getFilesFromDir } from './RosettaUtils';
import { RosettaFile } from './RosettaFile';
import { RosettaPatch } from './RosettaPatch';

import { RosettaNamespace } from './java/RosettaNamespace';
import { RosettaTable } from './lua/RosettaTable';
import { RosettaFunction } from './lua/RosettaFunction';
import { RosettaValue } from './lua/RosettaValue';
import { RosettaLuaClass } from './lua/RosettaLuaClass';

export class Rosetta {
    readonly patches: { [name: string]: RosettaPatch } = {};
    readonly files: { [path: string]: RosettaFile } = {};

    /* (Java) */
    readonly namespaces: { [name: string]: RosettaNamespace } = {};

    /* (Lua) */
    readonly luaClasses: { [name: string]: RosettaLuaClass } = {};
    readonly tables: { [name: string]: RosettaTable } = {};
    readonly functions: { [name: string]: RosettaFunction } = {};
    readonly values: { [name: string]: RosettaValue } = {};

    constructor() {
        const dir = 'assets/rosetta/json';
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

        this.loadPatches();
    }

    loadPatches() {

        console.log('\n################################');
        console.log('##      LOADING PATCHES       ##');
        console.log('################################\n');


        const dirPatches = 'assets/rosetta/patches';

        const files = fs.readdirSync(dirPatches);

        if (files.length === 0) return;

        for (const file of files) {
            const fileStats = fs.statSync(`${dirPatches}/${file}`);
            if (!fileStats.isDirectory()) continue;

            this.loadPatch(`${dirPatches}/${file}`);
        }
    }

    loadPatch(dir: string) {
        console.log('Loading patch: ' + dir + ' ..');
        const patch = new RosettaPatch(this, dir);
        patch.load();
        this.patches[patch.name] = patch;
    }
}
