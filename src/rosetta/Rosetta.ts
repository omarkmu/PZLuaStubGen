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
} from '../helpers'

type DataReader = (text: string) => any

export class Rosetta {
    readonly files: Record<string, RosettaFile>

    protected inputDirectory: string
    protected suppressErrors: boolean
    protected loaded: boolean = false

    constructor(args: RosettaArgs) {
        this.inputDirectory = args.inputDirectory
        this.suppressErrors = args.suppressErrors ?? false

        this.files = {}
    }

    async load(): Promise<boolean> {
        return (await this.loadFiles('json')) || (await this.loadFiles('yml'))
    }

    async loadJSON(
        filePath: string,
        basePath?: string,
    ): Promise<RosettaFile | undefined> {
        basePath ??= path.dirname(filePath)
        return await this.loadFile(filePath, basePath, JSON.parse, ['.json'])
    }

    async loadYAML(
        filePath: string,
        basePath?: string,
    ): Promise<RosettaFile | undefined> {
        basePath ??= path.dirname(filePath)
        return await this.loadFile(filePath, basePath, YAML.parse, [
            '.yml',
            '.yaml',
        ])
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
                cls.methods = arrayToRecord(obj.methods ?? [])
                cls.staticMethods = arrayToRecord(obj.staticMethods ?? [])

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
                tab.staticFields = arrayToRecord(obj.staticFields)
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
            if (!this.suppressErrors) {
                console.error(`Failed to read Rosetta file ${path}: ${e}`)
            }
        }
    }

    protected async loadFiles(type: string): Promise<boolean> {
        const basePath = `${this.inputDirectory}/${type}`
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
                if (!this.suppressErrors) {
                    console.error(
                        `Failed to read Rosetta directory '${dirPath}': ${e}`,
                    )
                }
            }
        }

        return true
    }
}
