# PZLuaStubGen

A command-line tool for generating Lua type annotations that are compatible with [lua-language-server](https://github.com/LuaLS/lua-language-server).

The generated stubs can be found in the [PZLuaStubs](https://github.com/omarkmu/PZLuaStubs) repository.

## Usage

To generate typestubs, you can run the build script then the `annotate` command.
From the top-level directory:
```
npm i
npm run build
node . annotate -i <DIRECTORY> -o <DIRECTORY>
```

For information about other commands, use `node . --help`.
