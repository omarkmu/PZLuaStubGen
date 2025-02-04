export class LuaHelpers {
    /**
     * Gets a mapping of files to potential aliases for requiring them.
     */
    static getAliasMap(fileSet: Iterable<string>): Map<string, Set<string>> {
        const aliasMap = new Map<string, Set<string>>()
        for (const identifier of fileSet) {
            for (const alias of LuaHelpers.getAliases(identifier)) {
                let aliasSet = aliasMap.get(alias)
                if (!aliasSet) {
                    aliasSet = new Set()
                    aliasMap.set(alias, aliasSet)
                }

                aliasSet.add(identifier)
            }
        }

        return aliasMap
    }

    /**
     * Gets potential aliases for a file identifier for requiring.
     */
    static getAliases(identifier: string): string[] {
        const aliases: string[] = []

        let slash = identifier.indexOf('/')
        while (slash !== -1) {
            identifier = identifier.slice(slash + 1)
            slash = identifier.indexOf('/')
            aliases.push(identifier)
        }

        return aliases
    }

    /**
     * Gets the identifier to use for a filename.
     */
    static getFileIdentifier(filename: string, basePath?: string) {
        if (basePath && filename.startsWith(basePath)) {
            filename = filename.slice(basePath.length)
        }

        if (filename.startsWith('/') || filename.startsWith('\\')) {
            filename = filename.slice(1)
        }

        if (filename.endsWith('.lua')) {
            filename = filename.slice(0, -4)
        }

        return filename.replace(/[\\.]/g, '/')
    }

    static getLuaFieldKey(literal: string): string {
        let key = literal
        if (key.startsWith('"') && key.endsWith('"')) {
            key = key.slice(1, -1)
        }

        // match on valid Lua identifier
        if (/^[a-zA-Z_][\w_]*$/.exec(key)) {
            return key
        }

        return `[${literal}]`
    }

    /**
     * Reads string contents from a raw Lua string.
     */
    static readLuaString(raw: string): string | undefined {
        if (raw.startsWith('"') || raw.startsWith("'")) {
            return raw.slice(1, -1)
        }

        // read multiline strings
        const start = /^\[(=*)\[/.exec(raw)
        if (!start) {
            return
        }

        const end = raw.indexOf(']' + '='.repeat(start[1].length) + ']')
        if (end === -1) {
            return
        }

        return raw.slice(start[0].length, end)
    }
}
