import path from 'path'
import { AnalyzeArgs, AnalyzedModule } from './types'
import { BaseReporter } from '../base'
import { Resolver } from '../dependency-resolution'
import { AnalysisReader } from './AnalysisReader'
import { AnalysisContext } from './AnalysisContext'
import { getAliasMap } from '../helpers'
import { log } from '../logger'

/**
 * Handles analysis of module types.
 */
export class Analyzer extends BaseReporter {
    protected reader: AnalysisReader
    protected context: AnalysisContext

    constructor(args: AnalyzeArgs) {
        super(args)

        this.context = new AnalysisContext()
        this.context.noLiteralClassFields = args.noLiteralClassFields ?? false

        this.reader = new AnalysisReader({
            errors: this.errors,
            context: this.context,
        })
    }

    /**
     * Runs analysis on the given directory.
     */
    async run() {
        this.resetState()

        const order = await this.getAnalysisOrder()

        const start = performance.now()
        const modules = await this.read(order)

        const time = (performance.now() - start).toFixed(0)
        log.verbose(`Finished analysis in ${time}ms`)

        this.reportErrors()
        return modules
    }

    /**
     * Generates a report containing results of analyzing Lua files.
     */
    async generateReport() {
        const modules = await this.run()

        this.reportErrors()
        await this.outputReport({ modules })
    }

    /**
     * Determines the files to analyze based on dependency resolution.
     * This returns a list of file identifiers, rather than filenames.
     */
    protected async getAnalysisOrder(): Promise<string[]> {
        const resolver = new Resolver({
            inputDirectory: this.inDirectory,
            subdirectories: this.subdirectories,
            errors: this.errors,
            suppressErrors: true, // report errors at the end
        })

        return await resolver.run()
    }

    /**
     * Reads the files in the provided array in order.
     */
    protected async read(identifiers: string[]): Promise<AnalyzedModule[]> {
        this.context.setAliasMap(getAliasMap(identifiers))

        // analyze types
        for (const identifier of identifiers) {
            try {
                if (this.fileSet.has(identifier)) {
                    throw new Error('Duplicate file identifier')
                }

                this.fileSet.add(identifier)
                const filename = path.join(
                    this.inDirectory,
                    identifier + '.lua',
                )

                await this.reader.readModuleInfo(identifier, filename)
            } catch (e) {
                this.errors.push(`Failed to analyze file '${identifier}': ${e}`)
            }
        }

        // resolve final types
        const moduleMap = this.context.finalizeModules()

        // build result
        const modules: AnalyzedModule[] = []
        for (const identifier of identifiers) {
            const module = moduleMap.get(identifier)
            if (module) {
                modules.push(module)
            }
        }

        return modules
    }
}
