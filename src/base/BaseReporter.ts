import fs from 'fs'
import path from 'path'
import { BaseReportArgs } from './types'

/**
 * Base class for classes that report on information about Lua.
 */
export abstract class BaseReporter {
    protected inDirectory: string
    protected outFile: string | undefined
    protected subdirectories: string[]
    protected errors: string[]
    protected fileSet: Set<string>
    protected suppressErrors: boolean

    constructor(args: BaseReportArgs) {
        this.inDirectory = path.normalize(args.inputDirectory)
        this.outFile = args.outFile ? path.normalize(args.outFile) : undefined
        this.errors = args.errors ?? []
        this.fileSet = new Set()
        this.suppressErrors = args.suppressErrors ?? false

        this.subdirectories = args.subdirectories ?? [
            'shared',
            'client',
            'server',
        ]

        if (args.allSubdirectories) {
            this.subdirectories = []
        } else {
            this.subdirectories = this.subdirectories.filter(
                (x) => x && x !== '',
            )
        }
    }

    /**
     * Gets the directories to scan for files.
     */
    protected getScanDirectories(): string[] {
        if (this.subdirectories.length === 0) {
            return [this.inDirectory]
        }

        const scanDirs = []
        for (const dirname of this.subdirectories) {
            scanDirs.push(path.join(this.inDirectory, dirname))
        }

        return scanDirs
    }

    protected async outputFile(outFile: string, content: string) {
        await fs.promises.mkdir(path.dirname(outFile), {
            recursive: true,
        })

        await fs.promises.writeFile(outFile, content, { flag: 'w' })
    }

    /**
     * Outputs a report object to an output file or the console.
     */
    protected async outputReport(report: object) {
        const json = JSON.stringify(
            report,
            (_, value) => (value instanceof Set ? [...value] : value),
            this.outFile ? 2 : undefined,
        )

        if (this.outFile) {
            const outFile = this.outFile.endsWith('.json')
                ? this.outFile
                : path.join(this.outFile, 'report.json')

            try {
                await this.outputFile(outFile, json)
                console.log(`Report generated at ${path.resolve(outFile)}`)
            } catch (e) {
                this.errors.push(`Failed to create file '${outFile}': ${e}`)
            }
        } else {
            console.log(json)
        }
    }

    /**
     * Outputs any errors that occurred during processing.
     * Errors are written to `stderr`.
     */
    protected reportErrors() {
        if (this.suppressErrors) {
            return
        }

        for (const err of this.errors) {
            console.error(err)
        }
    }

    /**
     * Resets the state of the reporter.
     */
    protected resetState() {
        this.fileSet.clear()
        this.errors.splice(0, this.errors.length)
    }
}
