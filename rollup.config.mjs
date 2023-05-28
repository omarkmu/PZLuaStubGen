import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default {
    input: './src/main.ts',
    output: {
        file: './pz-doc.js',
        format: 'cjs'
    },
    plugins: [
        typescript(),
        commonjs(),
        nodeResolve()
    ],
    onwarn: (warning, warn) => {
        // ignore 3rd party warnings
        if (warning.id && warning.id.indexOf('node_modules') !== -1) return
        if (warning.ids && warning.ids[0] && warning.ids[0].indexOf('node_modules') !== -1) return
        warn(warning)
    }
}
