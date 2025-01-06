export interface AnnotateArgs {
    in: string
    out: string
    verbose?: boolean
    ['include-kahlua']?: boolean
    ['strict-fields']?: boolean
    rosetta: string
}
