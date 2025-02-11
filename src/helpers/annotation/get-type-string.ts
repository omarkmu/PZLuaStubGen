export const getTypeString = (types: Set<string>): string => {
    types = new Set(types)
    if (types.size === 0) {
        return 'any'
    }

    const nullable = types.delete('nil')
    if (types.size === 0) {
        return 'any?'
    }

    const typeString = [...types].join(' | ')
    if (nullable) {
        return typeString.includes('|') ? `(${typeString})?` : `${typeString}?`
    }

    return typeString
}
