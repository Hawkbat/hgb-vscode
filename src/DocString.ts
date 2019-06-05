import * as v from 'vscode'
import { CapsStyle, getSetting, LANGUAGE_ID } from './Settings'

// tslint:disable: max-classes-per-file

function zeroPad(str: string, multiple: number): string {
    let len = multiple
    while (len < str.length) {
        len += multiple
    }
    return '0'.repeat(len - str.length) + str
}

function align(str: string, width: number, alignment: Align): string {
    switch (alignment) {
        case 'left':
            return str
        case 'right':
            return `${' '.repeat(width - str.length)}${str}`
        case 'center':
            return `${' '.repeat(Math.floor(width / 2 - str.length / 2))}${str}`
    }
}

function capitalize(str: string, style: CapsStyle): string {
    switch (style) {
        case 'uppercase':
            return str.toUpperCase()
        case 'lowercase':
            return str.toLowerCase()
        case 'preserve':
            return str
    }
}

type Align = 'left' | 'right' | 'center'

interface ILine {
    tokens: string[]
    align: Align
    language: string
}

export default class DocString {
    private lines: ILine[] = []
    private currentLine: ILine = {
        tokens: [],
        align: 'left',
        language: ''
    }

    public write(str: string): this {
        if (str) {
            if (str.includes('\n')) {
                const lines = str.split('\n')
                for (const line of lines) {
                    this.currentLine.tokens.push(line)
                    if (line !== lines[lines.length - 1]) {
                        this.lines.push(this.currentLine)
                        this.currentLine = {
                            ...this.currentLine,
                            tokens: []
                        }
                    }
                }
            } else {
                this.currentLine.tokens.push(str)
            }
        }
        return this
    }

    public line(str: string): this {
        return this.write(str).newline()
    }

    public newline(): this {
        this.lines.push(this.currentLine)
        this.currentLine = {
            ...this.currentLine,
            tokens: []
        }
        return this
    }

    public text(): this {
        this.currentLine.language = 'text'
        return this
    }

    public code(lang: string = LANGUAGE_ID): this {
        this.currentLine.language = lang
        return this
    }

    public markdown(): this {
        this.currentLine.language = ''
        return this
    }

    public left(): this {
        this.currentLine.align = 'left'
        return this
    }

    public right(): this {
        this.currentLine.align = 'right'
        return this
    }

    public center(): this {
        this.currentLine.align = 'center'
        return this
    }

    public if(cond: boolean, then: (s: DocString) => DocString, thenElse?: (s: DocString) => DocString): this {
        if (cond) {
            then(this)
        } else if (thenElse) {
            thenElse(this)
        }
        return this
    }

    public each<T>(items: T[], loop: (s: DocString, item: T) => DocString, join?: (s: DocString) => DocString): this {
        for (const item of items) {
            loop(this, item)
            if (join && item !== items[items.length - 1]) {
                join(this)
            }
        }
        return this
    }

    public append(): this {
        const top = this.currentLine.tokens.pop()
        this.currentLine.tokens.push(`${this.currentLine.tokens.pop()}${top}`)
        return this
    }

    public comma(): this {
        this.currentLine.tokens.push(`${this.currentLine.tokens.pop()},`)
        return this
    }

    public colon(): this {
        this.currentLine.tokens.push(`${this.currentLine.tokens.pop()}:`)
        return this
    }

    public quoted(): this {
        this.currentLine.tokens.push(`"${this.currentLine.tokens.pop()}"`)
        return this
    }

    public parenthesized(): this {
        this.currentLine.tokens.push(`(${this.currentLine.tokens.pop()})`)
        return this
    }

    public bracketed(): this {
        this.currentLine.tokens.push(`[${this.currentLine.tokens.pop()}]`)
        return this
    }

    public param(str: string): this {
        switch (str) {
            case 'a':
            case 'b':
            case 'c':
            case 'd':
            case 'e':
            case 'h':
            case 'l':
            case 'af':
            case 'bc':
            case 'de':
            case 'hl':
            case 'sp':
            case '[c]':
            case '[bc]':
            case '[de]':
            case '[hl]':
            case '[hl+]':
            case '[hl-]':
            case '[hli]':
            case '[hld]':
                return this.register(str)
            case 'C':
            case 'NC':
            case 'Z':
            case 'NZ':
                return this.conditionCode(str)
            case 'sp+e8':
                return this.register('sp').write('+e8').append()
            case '[$FF00+c]':
                return this.hex(0xFF00).write('+').append().register('c').append().bracketed()
            case '[$FF00+n8]':
                return this.hex(0xFF00).write('+').append().write('n8').append().bracketed()
            default:
                return this.write(str)
        }
    }

    public keyword(id: string): this {
        this.currentLine.tokens.push(`${capitalize(id, getSetting('hgbasm.formatting.keywords'))}`)
        return this
    }

    public opcode(id: string): this {
        this.currentLine.tokens.push(`${capitalize(id, getSetting('hgbasm.formatting.opcodes'))}`)
        return this
    }

    public psuedoOp(id: string): this {
        this.currentLine.tokens.push(`${capitalize(id, getSetting('hgbasm.formatting.psuedoOps'))}`)
        return this
    }

    public conditionCode(id: string): this {
        this.currentLine.tokens.push(`${capitalize(id, getSetting('hgbasm.formatting.conditionCodes'))}`)
        return this
    }

    public register(id: string): this {
        this.currentLine.tokens.push(`${capitalize(id, getSetting('hgbasm.formatting.registers'))}`)
        return this
    }

    public function(id: string): this {
        this.currentLine.tokens.push(`${capitalize(id, getSetting('hgbasm.formatting.functions'))}`)
        return this
    }

    public region(id: string): this {
        this.currentLine.tokens.push(`${capitalize(id, getSetting('hgbasm.formatting.regions'))}`)
        return this
    }

    public dec(n: number): this {
        this.currentLine.tokens.push(n.toString())
        return this
    }

    public oct(n: number): this {
        this.currentLine.tokens.push(`&${zeroPad(n.toString(8), 3)}`)
        return this
    }

    public bin(n: number): this {
        this.currentLine.tokens.push(`%${zeroPad(n.toString(2), 8)}`)
        return this
    }

    public hex(n: number): this {
        this.currentLine.tokens.push(`$${capitalize(zeroPad(n.toString(16), 2), getSetting('hgbasm.formatting.hexLetters'))}`)
        return this
    }

    public numberVariants(n: number): this {
        return this.code()
            .right().dec(n).newline()
            .right().hex(n).newline()
            .right().oct(n).newline()
            .right().bin(n).newline()
            .left()
    }

    public toString(): string {
        if (this.currentLine.tokens.length) {
            this.newline()
        }
        const width = this.lines.reduce((p, c) => Math.max(p, c.tokens.join(' ').length), 0)
        let output = ''
        let lang = ''
        for (const line of this.lines) {
            if (line.language !== lang) {
                if (lang) {
                    output += `\n\`\`\`\n`
                }
                lang = line.language
                if (lang) {
                    output += `\n\`\`\`${lang}\n`
                }
            }
            output += `${align(line.tokens.join(' '), width, line.align)}\n`
        }
        if (lang) {
            output += `\n\`\`\``
        }
        return output
    }

    public toMarkdown(): v.MarkdownString {
        return new v.MarkdownString(this.toString())
    }
}
