import { BaseReportArgs } from '../base'

/**
 * Arguments for annotation.
 */
export interface AnnotateArgs extends BaseReportArgs {
    /**
     * The directory to write typestub files to.
     */
    outputDirectory: string
}
