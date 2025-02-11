import { LuaExpression } from '../../analysis'
import { writeTableFields } from './write-table-fields'

export const getTableString = (
    expression: LuaExpression,
    depth: number = 1,
): string | undefined => {
    if (expression.type !== 'literal') {
        return
    }

    if (expression.luaType !== 'table') {
        return
    }

    const fields = expression.fields ?? []
    if (fields.length === 0) {
        return '{}'
    }

    const out: string[] = ['{']
    writeTableFields(fields, out, depth)

    out.push('\n')
    out.push('    '.repeat(Math.max(depth - 1, 0)))
    out.push('}')

    return out.join('')
}
