import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
import {
    RosettaArgs,
    RosettaClass,
    RosettaFile,
    RosettaFunction,
    RosettaTable,
} from './types'
import {
    arrayToRecord,
    expect,
    expectField,
    getFileIdentifier,
    readFileContents,
    time,
} from '../helpers'
import { log } from '../logger'

type DataReader = (text: string) => any

export class Rosetta {
    readonly files: Record<string, RosettaFile>

    readonly inputDirectory: string
    protected loaded: boolean = false

    constructor(args: RosettaArgs) {
        this.inputDirectory = args.inputDirectory

        this.files = {}
    }

    async load(dir?: string): Promise<boolean> {
        const targetDir = dir ?? this.inputDirectory
        log.verbose(`Loading Rosetta from '${targetDir}'`)

        return time(
            'loading Rosetta',
            async () => {
                if (await this.loadJSON(dir)) {
                    log.verbose('Loaded Rosetta from JSON definitions')
                    return true
                }

                if (await this.loadYAML(dir)) {
                    log.verbose('Loaded Rosetta from YAML definitions')
                    return true
                }

                return false
            },
            (result) => {
                if (!result) {
                    return `Failed to find Rosetta definitions in '${targetDir}'`
                }
            },
        )
    }

    async loadJSON(dir?: string): Promise<boolean> {
        return await this.loadFiles('json', dir)
    }

    async loadJsonFile(
        filePath: string,
        basePath?: string,
    ): Promise<RosettaFile | undefined> {
        return await this.loadFile(
            filePath,
            basePath ?? path.dirname(filePath),
            JSON.parse,
            ['.json'],
        )
    }

    async loadYAML(dir?: string): Promise<boolean> {
        return await this.loadFiles('yml', dir)
    }

    async loadYamlFile(
        filePath: string,
        basePath?: string,
    ): Promise<RosettaFile | undefined> {
        return await this.loadFile(
            filePath,
            basePath ?? path.dirname(filePath),
            YAML.parse,
            ['.yml', '.yaml'],
        )
    }

    readData(id: string, data: any): RosettaFile | undefined {
        expect(data, 'object')

        expectField(data, 'version', 'string', false)
        if (data.version !== '1.1') {
            throw new Error(`Unexpected version '${data.version}'`)
        }

        // no Lua data → ignore
        if (!expectField(data, 'languages.lua', 'object')) {
            return
        }

        const lua = data.languages.lua

        const classes: Record<string, RosettaClass> = {}
        if (expectField(data, 'languages.lua.classes', 'object')) {
            for (const name of Object.keys(lua.classes)) {
                const obj = lua.classes[name]
                expect(obj, 'object', `class '${name}'`)

                const cls = obj as RosettaClass
                cls.name = name
                cls.methods = arrayToRecord(obj.methods)
                cls.staticMethods = arrayToRecord(obj.staticMethods)

                classes[name] = cls
            }
        }

        const tables: Record<string, RosettaTable> = {}
        if (expectField(data, 'languages.lua.tables', 'object')) {
            for (const name of Object.keys(lua.tables)) {
                const obj = lua.tables[name]
                expect(obj, 'object', `table '${name}'`)

                const tab = obj as RosettaTable
                tab.name = name
                tab.methods = arrayToRecord(obj.methods)
                tab.staticMethods = arrayToRecord(obj.staticMethods)

                tables[name] = tab
            }
        }

        const functions: Record<string, RosettaFunction> = {}
        if (expectField(data, 'languages.lua.functions', 'array')) {
            for (let i = 0; i < lua.functions.length; i++) {
                const obj = lua.functions[i]
                expect(obj, 'object', `function at index ${i}`)

                functions[obj.name] = obj
            }
        }

        const file: RosettaFile = {
            id,
            classes,
            tables,
            functions,
        }

        this.files[id] = file
        return file
    }

    protected async loadFile(
        path: string,
        basePath: string,
        reader: DataReader,
        extensions: string[],
    ): Promise<RosettaFile | undefined> {
        try {
            const content = await readFileContents(path)
            const data = reader(content)
            const id = getFileIdentifier(path, basePath, extensions)
            return this.readData(id, data)
        } catch (e) {
            log.error(`Failed to read Rosetta file '${path}': ${e}`)
        }
    }

    protected async loadFiles(type: string, dir?: string): Promise<boolean> {
        const basePath = `${dir ?? this.inputDirectory}/${type}`
        if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory) {
            return false
        }

        let reader: DataReader
        let extensions: string[] = []
        switch (type) {
            case 'json':
                extensions = ['.json']
                reader = JSON.parse
                break

            case 'yml':
                extensions = ['.yml', '.yaml']
                reader = YAML.parse
                break

            default:
                return false
        }

        const stack = [basePath]
        while (stack.length > 0) {
            const dirPath = stack.pop()!

            try {
                const dir = await fs.promises.opendir(dirPath)

                for await (const fileOrDir of dir) {
                    const childPath = path.join(dirPath, fileOrDir.name)

                    if (fileOrDir.isDirectory()) {
                        stack.push(childPath)
                        continue
                    }

                    if (!fileOrDir.isFile()) {
                        continue
                    }

                    const extname = path.extname(childPath)
                    if (!extensions.includes(extname)) {
                        continue
                    }

                    await this.loadFile(childPath, basePath, reader, extensions)
                }
            } catch (e) {
                log.error(`Failed to read Rosetta directory '${dirPath}': ${e}`)
            }
        }

        return true
    }
}
