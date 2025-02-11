export const getRosettaTypeString = (
    type: string | undefined,
    optional: boolean | undefined,
    nullable?: boolean,
): string => {
    type ??= 'any'
    type = type.trim()

    if (nullable) {
        type += ' | nil'
    }

    if (optional) {
        return type.includes('|') ? `(${type})?` : `${type}?`
    }

    return type
}
