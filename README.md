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

## Extension Settings

Key settings:

* `hgbasm.analysisHoverEnabled`: Enable/disable analysis information on hover. Defaults to enabled.
* `hgbasm.analysisCodeLensEnabled`: Enable/disable analysis information codelens. Defaults to enabled.
* `hgbasm.formattingEnabled`: Enable/disable automatic formatting. Defaults to enabled.
* `hgbasm.autoCompleteEnabled`: Enable/disable autocompletion. Defaults to enabled.

For full control over the compiler settings used when editing your project, create a file called `gbconfig.json` in the root of your project and configure the settings within as appropriate.

## Known Issues

- Extremely large projects which split source code across many files will load very slowly or not at all.

## Release Notes

### 1.1.1

Improved support for interdependent file compilation and revised settings.

### 1.0.0

Initial release.
