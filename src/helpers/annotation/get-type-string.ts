export const getTypeString = (types: Set<string>): string => {
    types = new Set(types)
    const nullable = types.delete('nil')

    const type = types.size > 0 ? [...types].join(' | ') : 'unknown'
    if (nullable) {
        return type.includes('|') ? `(${type})?` : `${type}?`
    }

    return type
}
