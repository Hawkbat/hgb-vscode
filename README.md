# hgbasm

This extension provides editing capabilities powered by the [hgbasm](https://github.com/Hawkbat/hgbasm) compiler, which supports the RGBDS assembly language for Game Boy as well as hgbasm-specific language extensions. The extension can be installed from [here](https://marketplace.visualstudio.com/items?itemName=Hawkbat.hgbasm-vscode).

## Features

- Syntax highlighting of hgbasm and RGBDS syntaxes as well as linkerscripts
- Auto-completion of instructions, functions, defined symbols, and more
- Go To Definition, Find All References, and Rename functionality for user-defined symbols
- Document outlining and folding based on sections, global labels, and local labels
- Analytical information exposed on hover or as CodeLens items
- Automatic formatting of lines or whole documents
- Symbol information on hover
- Signature help for built-in functions

## Usage

This extension does not require anything else to be installed in order to provide editing functionality. However, to actually compile your Game Boy project, you should install [hgbasm-cli](https://github.com/Hawkbat/hgbasm-cli/) through NPM or use standalone [RGBDS](https://github.com/rednex/rgbds) binaries.

To enable the use of hgbasm-specific features, add this line at the top of the file:

```
#mode hgbasm
```

Also, for full control over the compiler settings used when editing your project, create a file called `gbconfig.json` in the root of your project and configure the settings within as appropriate.

## Extension Settings

Key settings:

* `hgbasm.project.configPath`: a path to a gbconfig.json file with compiler settings; defaults to './gbconfig.json'
* `hgbasm.project.includePath`: a path or glob pattern for the folders to search for includes; defaults to './**/'
* `hgbasm.project.sourcePath`: a path or glob pattern for the source files to assemble; defaults to './**/*.{asm,s,z80,gbz80,sm83,hgb}'
* `hgbasm.autoComplete.*`: include or exclude types of item from the auto-completion list
* `hgbasm.analysis.*`: controls where analysis information such as section sizes or label offsets should be displayed
* `hgbasm.formatting.enabled`: enable/disable automatic formatting
* `hgbasm.formatting.*`: determines how the formatter affects each type of symbol

## Known Issues

- Files which rely on other files being included ahead of them will throw errors on any missing symbols.
- Extremely large projects which split source code across many files will load very slowly or not at all.

## Release Notes

### 1.0.0

Initial release.
