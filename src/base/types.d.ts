import type ast from 'luaparse'

/**
 * Base arguments for a stub generation command.
 */
interface BaseArgs {
    /**
     * The directory to read Lua files from.
     */
    inputDirectory: string

    /**
     * Subdirectories to read Lua files from, in order of priority.
     * Dependency analysis may reorder the analysis.
     *
     * Defaults to ['shared', 'client', 'server'].
     */
    subdirectories?: string[]

    /**
     * If given, all subdirectories will be read.
     * This will make it so that the `subdirectories` option is ignored.
     */
    allSubdirectories?: boolean

    /**
     * An array to use to store errors.
     */
    errors?: string[]

    /**
     * If `true`, errors won't be displayed after processing.
     */
    suppressErrors?: boolean
}

/**
 * Base arguments for a class that reports on Lua information.
 */
interface BaseReportArgs extends BaseArgs {
    /**
     * The output file for a report.
     * If the given string does not end with `.json`, this is interpreted as a directory
     * and the output is sent to `report.json` in that directory.
     */
    outFile?: string
}

/**
 * Base arguments for Lua readers.
 */
interface BaseReaderArgs {
    /**
     * An array to write errors to.
     */
    errors: string[]
}

type AssignmentLHS = ast.Identifier | ast.MemberExpression | ast.IndexExpression

type AnyCallExpression =
    | ast.CallExpression
    | ast.StringCallExpression
    | ast.TableCallExpression

type BasicLiteral =
    | ast.StringLiteral
    | ast.BooleanLiteral
    | ast.NumericLiteral
    | ast.NilLiteral

type ResolvableOperation = ast.UnaryExpression | ast.BinaryExpression
