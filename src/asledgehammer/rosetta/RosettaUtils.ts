import fs from 'fs';

export const RESERVED_FUNCTION_NAMES = ['toString', 'valueOf'];
export const RESERVED_WORDS = [
    'and',
    'break',
    'do',
    'else',
    'elseif',
    'end',
    'false',
    'for',
    'function',
    'if',
    'in',
    'local',
    'nil',
    'not',
    'or',
    'repeat',
    'return',
    'then',
    'true',
    'until',
    'while',

    // NOTE: This is a technical issue involving YAML interpreting
    //       this as a BOOLEAN not a STRING value.
    'on',
    'off',
    'yes',
    'no',
];

export const formatName = (name: string): string => {
    for (const reservedWord of RESERVED_WORDS) {
        if (name.toLowerCase() === reservedWord) return '__' + name + '__';
    }
    for (const reservedFunctionName of RESERVED_FUNCTION_NAMES) {
        if (name === reservedFunctionName) return '__' + name + '__';
    }
    return name;
};

export const getFilesFromDir = (dir: string): string[] => {
    if (!fs.existsSync(dir)) {
        throw new Error(`Directory doesn't exist: ${dir}`);
    } else if (!fs.statSync(dir).isDirectory()) {
        throw new Error(`Path isn't directory: ${dir}`);
    }

    return fs.readdirSync(dir, { recursive: true }).map((s) => `${dir}/${s}`);
};
