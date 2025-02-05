import { BaseReportArgs } from '../base'

/**
 * Arguments for annotation.
 */
export interface AnnotateArgs extends BaseReportArgs {
    /**
     * The directory to write typestub files to.
     */
    outputDirectory: string

    /**
     * The directory to load rosetta files from.
     */
    rosetta: string

    /**
     * Whether fields and functions in the generated stubs should be alphabetized.
     */
    alphabetize: boolean

    /**
     * Classes which should be excluded from the generated stubs.
     */
    exclude?: string[]

    /**
     * Classes whose fields should be excluded from the generated stubs.
     */
    excludeFields?: string[]

    /**
     * Whether known large definition classes should have their fields excluded.
     */
    excludeKnownDefs: boolean
}
