import * as fs from 'fs-extra'
import * as glob from 'glob'
import { AsmFile, AssemblerContext, FileContext, IFileProvider, ILogPipe } from 'hgbasm'
import FunctionRules from 'hgbasm/lib/Evaluator/FunctionRules'
import OpRules from 'hgbasm/lib/Evaluator/OpRules'
import PredefineRules from 'hgbasm/lib/Evaluator/PredefineRules'
import IVersion from 'hgbasm/lib/IVersion'
import ISymbol from 'hgbasm/lib/LineState/ISymbol'
import RegionType from 'hgbasm/lib/Linker/RegionType'
import SymbolType from 'hgbasm/lib/Linker/SymbolType'
import Token from 'hgbasm/lib/Token'
import TokenType from 'hgbasm/lib/TokenType'
import * as pathUtil from 'path'
import * as v from 'vscode'
import DocString from './DocString'
import { GameBoyProject } from './GameBoyProject'
import Host from './Host'
import { getSetting, LANGUAGE_ID } from './Settings'

export default class Provider implements v.CompletionItemProvider, v.HoverProvider, v.SignatureHelpProvider, v.DefinitionProvider, v.ReferenceProvider, v.DocumentHighlightProvider, v.DocumentSymbolProvider, v.WorkspaceSymbolProvider, v.CodeActionProvider, v.CodeLensProvider, v.FoldingRangeProvider, v.DocumentColorProvider, v.DocumentFormattingEditProvider, v.DocumentRangeFormattingEditProvider, v.OnTypeFormattingEditProvider, v.RenameProvider, ILogPipe, IFileProvider {
    public ctx: v.ExtensionContext | null = null
    public allowAnsi: boolean = false
    public host: Host
    public diagnostics: v.DiagnosticCollection | undefined
    public onDidChangeCodeLenses?: v.Event<void> | undefined

    constructor() {
        this.host = new Host(this)
    }

    public error(msg: string): Promise<void> {
        console.error(msg)
        process.stderr.write(msg)
        return new Promise((res, rej) => {
            setTimeout(() => {
                res()
            }, 100)
        })
    }

    public log(msg: string, type: string): void {
        if (type === 'error' || type === 'fatal') {
            console.error(msg)
            process.stderr.write(msg)
        } else {
            console.log(msg)
            process.stdout.write(msg)
        }
    }

    public async retrieve(path: string, sender: AsmFile, binary: boolean): Promise<AsmFile | null> {
        const senderFile = this.host.getFile(sender.path)
        if (v.workspace.workspaceFolders) {
            for (const rootFolder of v.workspace.workspaceFolders.map(f => f.uri.fsPath)) {
                const includeFolders = []
                for (const incPath of this.host.getIncludePaths()) {
                    includeFolders.push(...glob.sync(incPath, { cwd: rootFolder }).map(folder => pathUtil.resolve(rootFolder, folder)))
                }

                const filePaths = [
                    pathUtil.resolve(rootFolder, path),
                    pathUtil.resolve(pathUtil.dirname(sender.path), path),
                    ...includeFolders.map(incPath => pathUtil.resolve(incPath, path))
                ]
                const cachedFiles = filePaths.map(filePath => this.host.getFile(filePath)).filter(f => f !== null)
                if (cachedFiles.length) {
                    return cachedFiles[0]!.file
                }
                for (const filePath of filePaths) {
                    if (fs.existsSync(filePath)) {
                        const contents = fs.readFileSync(filePath, binary ? 'binary' : 'utf8')
                        return this.host.register(filePath, contents, senderFile).file
                    }
                }
            }
        }
        return null
    }

    public activate(ctx: v.ExtensionContext): void {
        this.ctx = ctx

        this.diagnostics = v.languages.createDiagnosticCollection(LANGUAGE_ID)
        ctx.subscriptions.push(this.diagnostics)

        if (v.workspace.workspaceFolders) {
            for (const rootFolder of v.workspace.workspaceFolders) {
                const projectPattern = new v.RelativePattern(rootFolder, '**/gbconfig.json')

                v.workspace.findFiles(projectPattern).then(uris => {
                    for (const uri of uris) {
                        v.workspace.openTextDocument(uri).then(doc => this.updateProjectSettings(doc))
                    }
                })

                const projectWatcher = v.workspace.createFileSystemWatcher(projectPattern)
                projectWatcher.onDidChange(uri => v.workspace.openTextDocument(uri).then(doc => this.updateProjectSettings(doc)))
                projectWatcher.onDidCreate(uri => v.workspace.openTextDocument(uri).then(doc => this.updateProjectSettings(doc)))
                projectWatcher.onDidDelete(uri => this.clearProjectSettings())
            }
        }

        ctx.subscriptions.push(v.workspace.onDidOpenTextDocument(e => this.updateDocument(e)))
        ctx.subscriptions.push(v.workspace.onDidChangeTextDocument(e => this.updateDocument(e.document)))

        const selector: v.DocumentSelector = { scheme: 'file', language: LANGUAGE_ID }

        ctx.subscriptions.push(v.languages.registerCompletionItemProvider(selector, this, '.', ' ', '['))
        ctx.subscriptions.push(v.languages.registerHoverProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerSignatureHelpProvider(selector, this, ',', '('))
        ctx.subscriptions.push(v.languages.registerDefinitionProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerReferenceProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerDocumentHighlightProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerDocumentSymbolProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerWorkspaceSymbolProvider(this))
        ctx.subscriptions.push(v.languages.registerCodeLensProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerFoldingRangeProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerDocumentFormattingEditProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerDocumentRangeFormattingEditProvider(selector, this))
        ctx.subscriptions.push(v.languages.registerOnTypeFormattingEditProvider(selector, this, ')', ']', ','))
        ctx.subscriptions.push(v.languages.registerRenameProvider(selector, this))
    }

    public deactivate(): void {
        // TODO: clean up
    }

    public getHgbasmVersion(): IVersion {
        const str: string = require(pathUtil.resolve(__dirname, '../node_modules/hgbasm/package.json')).version
        const bits = str.split('.')
        return {
            major: parseInt(bits[0], 10),
            minor: parseInt(bits[1], 10),
            patch: parseInt(bits[2], 10)
        }
    }

    public async updateProjectSettings(doc: v.TextDocument): Promise<void> {
        let projectFile: GameBoyProject = {}
        try {
            projectFile = JSON.parse(doc.getText())
        } catch (e) {
            return
        }
        this.host.setProject(projectFile)

        if (v.workspace.workspaceFolders) {
            for (const rootFolder of v.workspace.workspaceFolders) {
                for (const srcPath of this.host.getSourcePaths()) {
                    const srcPattern = new v.RelativePattern(rootFolder, srcPath)

                    v.workspace.findFiles(srcPattern).then(uris => {
                        for (const uri of uris) {
                            v.workspace.openTextDocument(uri).then(d => this.updateDocument(d))
                        }
                    })

                    if (this.ctx) {
                        const srcWatcher = v.workspace.createFileSystemWatcher(srcPattern)
                        srcWatcher.onDidChange(uri => v.workspace.openTextDocument(uri).then(d => this.updateDocument(d)))
                        srcWatcher.onDidCreate(uri => v.workspace.openTextDocument(uri).then(d => this.updateDocument(d)))
                        srcWatcher.onDidDelete(uri => this.unloadFile(uri))
                        this.ctx.subscriptions.push(srcWatcher)
                    }
                }
            }
        }
        this.compileAllSourceFiles()
    }

    public clearProjectSettings(): void {
        this.host.setProject(null)
        this.compileAllSourceFiles()
    }

    public async updateDocument(doc: v.TextDocument): Promise<void> {
        if (doc.languageId !== LANGUAGE_ID || doc.uri.fsPath.endsWith('.git')) {
            return
        }
        this.host.register(doc.uri.fsPath, doc.getText())
        await this.assembleDoc(doc)
    }

    public async assembleDoc(doc: v.TextDocument): Promise<AssemblerContext | null> {
        if (!this.host.getFile(doc.uri.fsPath)) {
            this.host.register(doc.uri.fsPath, doc.getText())
        }
        const result = await this.host.assemble(doc.uri.fsPath, false)
        if (!result) {
            return null
        }
        if (result && this.diagnostics) {
            for (const uri of [doc.uri, ...result.dependencies.map(d => v.Uri.file(d.path))]) {
                this.diagnostics.set(uri, result.diagnostics.filter(d => {
                    const path = d.line ? d.line.file.source.path : null
                    return path === uri.fsPath
                }).map(d => {
                    const startLine = d.line ? d.line.lineNumber : d.token ? d.token.line : 0
                    const endLine = startLine
                    const startCol = d.token ? d.token.col : 0
                    const endCol = d.token ? d.token.col + d.token.value.length : Infinity

                    const severity = d.type === 'error' ? v.DiagnosticSeverity.Error :
                        d.type === 'warn' ? v.DiagnosticSeverity.Warning :
                            v.DiagnosticSeverity.Information
                    return new v.Diagnostic(new v.Range(startLine, startCol, endLine, endCol), d.msg, severity)
                }))
            }
        }
        return result
    }

    public async assembleFile(uri: v.Uri): Promise<AssemblerContext | null> {
        return this.assembleDoc(await v.workspace.openTextDocument(uri))
    }

    public unloadFile(uri: v.Uri): void {
        this.host.deleteFile(uri.fsPath)
    }

    public getDocComments(path: string, line: number): string {
        const file = this.host.getFile(path)
        if (!file) {
            return ''
        }
        let docs = ''
        const lines = file.file.lines
        if (lines[line].text.includes(';')) {
            docs += `${lines[line].text.substr(lines[line].text.indexOf(';')).substr(1).trim()}\n`
        }
        while (line > 0 && lines[--line].text.trim().startsWith(';')) {
            if (lines[line].text.startsWith(';*')) {
                break
            }
            docs = `${lines[line].text.substr(1).trim()}\n${docs}`
        }
        return docs
    }

    public async getToken(doc: v.TextDocument, pos: v.Position): Promise<Token | null> {
        const file = await this.getFileContext(doc)
        if (!file) {
            return null
        }
        const lexCtx = file.lines[pos.line].lex
        if (lexCtx) {
            const tokens = lexCtx.tokens.filter(t => t.type !== TokenType.space && t.col <= pos.character && t.col + t.value.length > pos.character)
            if (tokens.length > 0) {
                return tokens[0]
            }
        }

        return null
    }

    public getSymbol(token: Token, result: AssemblerContext, file: FileContext, includeImports: boolean = false): ISymbol | null {
        const evalCtx = file.lines[token.line].eval
        if (token.type === TokenType.identifier || token.type === TokenType.macro_call || token.type === TokenType.macro_argument) {
            let id = token.value.trim()
            if (id.includes(':')) {
                id = id.substring(0, id.indexOf(':'))
            }
            if (evalCtx && id.charAt(0) === '.') {
                id = evalCtx.meta.inGlobalLabel + id
            }
            if (result.state.numberEquates && result.state.numberEquates[id]) {
                return result.state.numberEquates[id]
            }
            if (result.state.stringEquates && result.state.stringEquates[id]) {
                return result.state.stringEquates[id]
            }
            if (result.state.sets && result.state.sets[id]) {
                return result.state.sets[id]
            }
            if (result.state.labels && result.state.labels[id]) {
                return result.state.labels[id]
            }
            if (result.state.macros && result.state.macros[id]) {
                return result.state.macros[id]
            }
            if (includeImports) {
                const symbol = result.objectFile.symbols.find(s => s.name === id && s.type === SymbolType.Imported)
                if (symbol) {
                    return {
                        id: symbol.name,
                        file: symbol.file,
                        startLine: symbol.line,
                        endLine: symbol.line
                    }
                }
            }
        }
        return null
    }

    public async compileAllSourceFiles(): Promise<AssemblerContext[]> {
        const results: AssemblerContext[] = []
        if (v.workspace.workspaceFolders) {
            for (const rootFolder of v.workspace.workspaceFolders) {
                for (const srcPath of this.host.getSourcePaths()) {
                    const uris = await v.workspace.findFiles(new v.RelativePattern(rootFolder, srcPath))
                    for (const uri of uris) {
                        const result = await this.assembleFile(uri)
                        if (result) {
                            results.push(result)
                        }
                    }
                }
            }
        }
        return results
    }

    public async getFileContext(doc: v.TextDocument): Promise<FileContext | null> {
        const ctx = await this.assembleDoc(doc)
        if (!ctx) {
            return null
        }
        return this.host.getFileContext(doc.uri.fsPath, ctx)
    }

    public getSymbolRange(symbol: ISymbol, file: FileContext): v.Range {
        return new v.Range(symbol.startLine, 0, symbol.endLine, file.lines[symbol.endLine].source.text.length)
    }

    public getCompletionItem(symbol: ISymbol, kind: v.CompletionItemKind): v.CompletionItem {
        const item = new v.CompletionItem(symbol.id, kind)
        const docs = this.getDocComments(symbol.file, symbol.startLine)
        if (docs) {
            item.detail = docs
        }
        return item
    }

    public async provideCompletionItems(doc: v.TextDocument, pos: v.Position, cancelToken: v.CancellationToken, context: v.CompletionContext): Promise<v.CompletionItem[] | v.CompletionList | null | undefined> {
        const items: v.CompletionItem[] = []

        let token: Token | null = null
        while (!token && pos.character > 0) {
            pos = pos.translate(0, -1)
            token = await this.getToken(doc, pos)
        }

        const ctx = await this.host.autoComplete(doc.uri.fsPath, token)
        if (!ctx) {
            return null
        }
        if (!ctx.results) {
            return items
        }

        if (ctx.results.keywords) {
            for (const keyword of Object.keys(ctx.results.keywords)) {
                items.push(new v.CompletionItem(new DocString(this).keyword(keyword).toString(), v.CompletionItemKind.Keyword))
            }
        }
        if (ctx.results.instructions) {
            for (const id of Object.keys(ctx.results.instructions)) {
                for (const op of OpRules[id]) {
                    const label = new DocString(this).opcode(id).each(op.args, (s, p) => s.param(p), s => s.comma()).toString()
                    const item = new v.CompletionItem(label, v.CompletionItemKind.Snippet)
                    // tslint:disable-next-line: no-invalid-template-strings
                    item.insertText = new v.SnippetString(label.replace(/(?<!:)(n8|n16|e8|u3|vec)/, '${1:$1}').replace(/(?<!:)(n8|n16|e8|u3|vec)/, '${2:$1}'))
                    item.detail = new DocString(this)
                        .line(op.desc)
                        .newline()
                        .write('Bytes:').dec(op.bytes).newline()
                        .write('Cycles:').write(`${op.conditionalCycles ? `${op.conditionalCycles}/` : ''}${op.cycles}`).newline()
                        .newline()
                        .write('Flags:').if(!op.flags, s => s.write('No flags affected')).newline()
                        .if(!!op.flags && !!op.flags.z, s => s.write('Z:').write(op.flags!.z!).newline())
                        .if(!!op.flags && !!op.flags.n, s => s.write('N:').write(op.flags!.n!).newline())
                        .if(!!op.flags && !!op.flags.h, s => s.write('H:').write(op.flags!.h!).newline())
                        .if(!!op.flags && !!op.flags.c, s => s.write('C:').write(op.flags!.c!).newline())
                        .toString()
                    items.push(item)
                }
            }
        }
        if (ctx.results.functions) {
            for (const id of Object.keys(ctx.results.functions)) {
                const rule = FunctionRules[id]
                const label = new DocString(this).function(id).write(rule.params.map(p => p.name).join(', ')).parenthesized().append().toString()
                const item = new v.CompletionItem(label, v.CompletionItemKind.Function)
                const snippet = new DocString(this).function(id).write(rule.params.map((p, i) => `\$${i + 1}:${p.name}}`).join(', ')).parenthesized().append().toString()
                item.insertText = new v.SnippetString(snippet)
                item.detail = new DocString(this)
                    .function(id).write(rule.params.map(p => `${p.name}: ${p.type}`).join(', ')).parenthesized().append().newline()
                    .newline()
                    .line(rule.desc)
                    .newline()
                    .write('Returns:').write(rule.return.desc).newline()
                    .toString()
                item.command = { title: '', command: 'editor.action.triggerParameterHints' }
                items.push(item)
            }
        }
        if (ctx.results.predefines) {
            for (const id of Object.keys(ctx.results.predefines)) {
                items.push(new v.CompletionItem(id, v.CompletionItemKind.Constant))
            }
        }
        if (ctx.results.regions) {
            for (const id of Object.keys(RegionType)) {
                items.push(new v.CompletionItem(new DocString(this).region(id).toString(), v.CompletionItemKind.EnumMember))
            }
        }
        if (ctx.results.numberEquates) {
            for (const id of Object.keys(ctx.results.numberEquates)) {
                items.push(this.getCompletionItem(ctx.results.numberEquates[id], v.CompletionItemKind.Constant))
            }
        }
        if (ctx.results.sets) {
            for (const id of Object.keys(ctx.results.sets)) {
                items.push(this.getCompletionItem(ctx.results.sets[id], v.CompletionItemKind.Variable))
            }
        }
        if (ctx.results.labels) {
            const file = await this.getFileContext(doc)
            const evalCtx = file ? file.lines[pos.line].eval : null
            for (const id of Object.keys(ctx.results.labels)) {
                const label = ctx.results.labels[id]
                const item = this.getCompletionItem(label, v.CompletionItemKind.Variable)
                if (evalCtx && evalCtx.meta.inGlobalLabel && id.startsWith(evalCtx.meta.inGlobalLabel)) {
                    item.label = id.substr(evalCtx.meta.inGlobalLabel.length)
                }
                items.push(item)
            }
        }
        if (ctx.results.macros) {
            for (const id of Object.keys(ctx.results.macros)) {
                items.push(this.getCompletionItem(ctx.results.macros[id], v.CompletionItemKind.Function))
            }
        }
        if (ctx.results.stringEquates) {
            for (const id of Object.keys(ctx.results.stringEquates)) {
                items.push(this.getCompletionItem(ctx.results.stringEquates[id], v.CompletionItemKind.Constant))
            }
        }

        return items
    }

    public async provideHover(doc: v.TextDocument, pos: v.Position, cancelToken: v.CancellationToken): Promise<v.Hover | null | undefined> {
        const result = await this.assembleDoc(doc)
        if (!result) {
            return null
        }
        const token = await this.getToken(doc, pos)
        if (!token) {
            return null
        }

        const file = await this.getFileContext(doc)
        const evalCtx = file ? file.lines[pos.line].eval : null

        switch (token.type) {
            case TokenType.binary_number:
            case TokenType.decimal_number:
            case TokenType.fixed_point_number:
            case TokenType.gbgfx_number:
            case TokenType.hex_number:
            case TokenType.octal_number: {
                let n = 0
                if (token.value.charAt(0) === '$') {
                    n = parseInt(token.value.substr(1), 16)
                } else if (token.value.charAt(0) === '&') {
                    n = parseInt(token.value.substr(1), 8)
                } else if (token.value.charAt(0) === '`') {
                    n = parseInt(token.value.substr(1), 4)
                } else if (token.value.charAt(0) === '%') {
                    n = parseInt(token.value.substr(1), 2)
                } else {
                    n = parseFloat(token.value)
                }
                return new v.Hover(new DocString(this).code().numberVariants(n).toMarkdown())
            }
            case TokenType.macro_call:
            case TokenType.identifier: {
                if (result.state.numberEquates) {
                    const equ = result.state.numberEquates[token.value]
                    if (equ) {
                        return new v.Hover(new DocString(this)
                            .if(!!this.getDocComments(equ.file, equ.startLine).trim(), s => s.text().line(this.getDocComments(equ.file, equ.startLine)))
                            .code().write(equ.id).keyword('EQU').hex(equ.value).newline()
                            .numberVariants(equ.value)
                            .toMarkdown())
                    }
                }
                if (result.state.sets) {
                    const set = result.state.sets[token.value]
                    if (set) {
                        return new v.Hover(new DocString(this)
                            .if(!!this.getDocComments(set.file, set.startLine).trim(), s => s.text().line(this.getDocComments(set.file, set.startLine)))
                            .code().write(set.id).keyword('SET').hex(set.value).newline()
                            .numberVariants(set.value)
                            .toMarkdown())
                    }
                }
                if (result.state.stringEquates) {
                    const equs = result.state.stringEquates[token.value]
                    if (equs) {
                        return new v.Hover(new DocString(this)
                            .if(!!this.getDocComments(equs.file, equs.startLine).trim(), s => s.text().line(this.getDocComments(equs.file, equs.startLine)))
                            .code().write(equs.id).keyword('EQUS').write(equs.value).quoted().newline()
                            .toMarkdown())
                    }
                }
                if (result.state.labels) {
                    let id = token.value
                    if (id.includes(':')) {
                        id = id.substring(0, id.indexOf(':'))
                    }
                    if (evalCtx && id.charAt(0) === '.') {
                        id = evalCtx.meta.inGlobalLabel + id
                    }
                    const label = result.state.labels[id]
                    if (label) {
                        const analysis = await this.host.analyze(doc.uri.fsPath)
                        const size = analysis && analysis.results ? analysis.results.labelSizes.find(r => r.symbol.id === id && (r.display === 'all' || r.display === 'hover')) : undefined
                        const offset = analysis && analysis.results ? analysis.results.labelOffsets.find(r => r.symbol.id === id && (r.display === 'all' || r.display === 'hover')) : undefined

                        return new v.Hover(new DocString(this)
                            .if(!!this.getDocComments(label.file, label.startLine).trim(), s => s.text().line(this.getDocComments(label.file, label.startLine)))
                            .code().if(label.exported, s => s.keyword('EXPORT')).write(label.id).newline()
                            .if(getSetting('hgbasm.analysisHoverEnabled'), s => s
                                .if(!!size, t => t.text().line('Size in bytes:').numberVariants(size!.value))
                                .if(!!offset, t => t.text().line('Offset in section:').numberVariants(offset!.value))
                            )
                            .toMarkdown())
                    }
                }
                if (result.state.macros) {
                    const macro = result.state.macros[token.value]
                    if (macro) {
                        return new v.Hover(new DocString(this)
                            .if(!!this.getDocComments(macro.file, macro.startLine).trim(), s => s.text().line(this.getDocComments(macro.file, macro.startLine)))
                            .code().write(macro.id).write(':').keyword('MACRO').newline()
                            .toMarkdown())
                    }
                }
                if (result.objectFile.symbols.some(s => s.name === token.value && s.type === SymbolType.Imported)) {
                    return new v.Hover(new DocString(this)
                        .code().keyword('import').parenthesized().write(token.value)
                        .toMarkdown())
                }
                if (PredefineRules[token.value]) {
                    return new v.Hover(new DocString(this)
                        .code().keyword('predefine').parenthesized().write(token.value)
                        .toMarkdown())
                }
                break
            }
            case TokenType.keyword:
            case TokenType.string: {
                const val = token.value.toLowerCase()
                if (token.type === TokenType.keyword && val !== 'section' && val !== 'bank' && val !== 'align') {
                    break
                }
                if (evalCtx && result.state.sections && evalCtx.meta.section) {
                    const section = result.state.sections[evalCtx.meta.section]
                    if (section) {
                        const analysis = await this.host.analyze(doc.uri.fsPath)
                        const size = analysis && analysis.results ? analysis.results.sectionSizes.find(r => r.symbol.id === section.id && (r.display === 'all' || r.display === 'hover')) : undefined

                        return new v.Hover(new DocString(this)
                            .if(!!this.getDocComments(section.file, section.startLine).trim(), s => s.text().line(this.getDocComments(section.file, section.startLine)))
                            .code().keyword('SECTION').write(section.id).comma().region(section.region)
                            .if(section.fixedAddress !== undefined, s => s.hex(section.fixedAddress!).bracketed().append())
                            .if(section.bank !== undefined, s => s.comma().keyword('BANK').hex(section.bank!).bracketed().append())
                            .if(section.alignment !== undefined, s => s.comma().keyword('ALIGN').dec(section.alignment!).bracketed().append())
                            .if(!!size, s => s.newline().text().line('Section size:').numberVariants(size!.value))
                            .toMarkdown())
                    }
                }
                break
            }
            case TokenType.opcode: {
                if (evalCtx && evalCtx.meta.op && evalCtx.meta.variant !== undefined) {
                    const op = OpRules[evalCtx.meta.op][evalCtx.meta.variant]
                    return new v.Hover(new DocString(this)
                        .code().opcode(evalCtx.meta.op).each(op.args, (s, p) => s.param(p), s => s.comma()).newline()
                        .text().line(op.desc)
                        .newline()
                        .write('Bytes:').dec(op.bytes).newline()
                        .write('Cycles:').write(`${op.conditionalCycles ? `${op.conditionalCycles}/` : ''}${op.cycles}`).newline()
                        .newline()
                        .write('Flags:').if(!op.flags, s => s.write('No flags affected')).newline()
                        .if(!!op.flags && !!op.flags.z, s => s.write('- Z:').write(op.flags!.z!).newline())
                        .if(!!op.flags && !!op.flags.n, s => s.write('- N:').write(op.flags!.n!).newline())
                        .if(!!op.flags && !!op.flags.h, s => s.write('- H:').write(op.flags!.h!).newline())
                        .if(!!op.flags && !!op.flags.c, s => s.write('- C:').write(op.flags!.c!).newline())
                        .toMarkdown())
                }
                break
            }
            case TokenType.function: {
                const func = token.value.toLowerCase()
                const rule = FunctionRules[func]
                return new v.Hover(new DocString(this)
                    .code().function(func).write(rule.params.map(p => `${p.name}: ${p.type}`).join(', ')).parenthesized().append().newline()
                    .newline()
                    .text().line(rule.desc)
                    .newline()
                    .write('Returns:').write(rule.return.desc).newline()
                    .toMarkdown())
            }
            case TokenType.condition: {
                return new v.Hover(new DocString(this)
                    .code().keyword('condition').parenthesized().conditionCode(token.value)
                    .toMarkdown())
            }
            case TokenType.register: {
                return new v.Hover(new DocString(this)
                    .code().keyword('register').parenthesized().register(token.value)
                    .toMarkdown())
            }
            case TokenType.region: {
                let desc = ''
                let range = ''
                switch (token.value.toLowerCase()) {
                    case 'rom0':
                        desc = 'A fixed cart ROM region, also called the "home" region.'
                        range = '$0000 - $3FFF ($0000 - $7FFF with banking disabled)'
                        break
                    case 'romx':
                        desc = 'A banked cart ROM region'
                        range = '$4000 - $7FFF'
                        break
                    case 'vram':
                        desc = 'The video RAM region'
                        range = '$8000 - $9FFF'
                        break
                    case 'sram':
                        desc = 'The external (save) cart RAM region'
                        range = '$A000 - $BFFF'
                        break
                    case 'wram0':
                        desc = 'A fixed general-purpose RAM region'
                        range = '$C000 - $CFFF ($C000 - $DFFF with banking disabled)'
                        break
                    case 'wramx':
                        desc = 'A banked general-purpose RAM region'
                        range = '$D000 - $DFFF'
                        break
                    case 'oam':
                        desc = 'The object attributes RAM region'
                        range = '$FE00 - $FE9F'
                        break
                    case 'hram':
                        desc = 'The high RAM region'
                        range = '$FF80 - $FFFE'
                        break
                }
                return new v.Hover(new DocString(this)
                    .code().keyword('region').parenthesized().region(token.value).newline()
                    .line(range)
                    .text().line(desc)
                    .toMarkdown())
            }
        }
        return null
    }

    public async provideSignatureHelp(doc: v.TextDocument, pos: v.Position, cancelToken: v.CancellationToken, context: v.SignatureHelpContext): Promise<v.SignatureHelp | null | undefined> {
        let paramIndex = 0

        let token: Token | null = null
        while ((!token || token.type !== TokenType.function) && pos.character > 0) {
            pos = pos.translate(0, -1)
            token = await this.getToken(doc, pos)
            if (token && token.type === TokenType.comma) {
                paramIndex++
            }
        }
        if (token && token.type === TokenType.function) {
            const func = token.value.toLowerCase()
            const rule = FunctionRules[func]
            const label = new DocString(this).function(func).write(rule.params.map(p => `${p.name}: ${p.type}`).join(', ')).parenthesized().append().toString()
            const docs = new DocString(this)
                .text().line(rule.desc)
                .newline()
                .write('Returns:').write(rule.return.desc).newline()
                .toMarkdown()
            const help = new v.SignatureHelp()
            help.activeParameter = paramIndex
            const sig = new v.SignatureInformation(label, docs)
            sig.parameters = rule.params.map(p => new v.ParameterInformation(`${p.name}: ${p.type}`, p.desc))
            help.signatures = [sig]
            help.activeSignature = 0
            return help
        }
        return null
    }

    public async provideDefinition(doc: v.TextDocument, pos: v.Position, cancelToken: v.CancellationToken): Promise<v.Location | v.Location[] | v.LocationLink[] | null | undefined> {
        const result = await this.assembleDoc(doc)
        if (!result) {
            return null
        }
        const rootFile = await this.getFileContext(doc)
        if (!rootFile) {
            return null
        }
        const token = await this.getToken(doc, pos)
        if (!token) {
            return null
        }
        let symbol = this.getSymbol(token, result, rootFile)
        if (symbol) {
            return new v.Location(v.Uri.file(symbol.file), new v.Position(symbol.startLine, 0))
        }
        symbol = this.getSymbol(token, result, rootFile, true)
        if (!symbol) {
            return null
        }
        const results = await this.compileAllSourceFiles()
        for (const assembly of results) {
            for (const file of assembly.files) {
                const uri = v.Uri.file(file.source.path)
                if (uri === doc.uri) {
                    continue
                }
                for (const line of file.lines) {
                    if (line.lex && line.eval) {
                        const tokens = line.lex.tokens.filter(t => t.type === TokenType.identifier)
                        for (const t of tokens) {
                            const sym = this.getSymbol(t, assembly, file)
                            if (sym && sym.id === symbol.id) {
                                return new v.Location(uri, new v.Position(t.line, t.col))
                            }
                        }
                    }
                }
            }
        }
        return null
    }

    public async provideReferences(doc: v.TextDocument, pos: v.Position, context: v.ReferenceContext, cancelToken: v.CancellationToken): Promise<v.Location[] | null | undefined> {
        const result = await this.assembleDoc(doc)
        if (!result) {
            return null
        }
        const rootFile = await this.getFileContext(doc)
        if (!rootFile) {
            return null
        }
        const evalCtx = rootFile.lines[pos.line].eval
        if (!evalCtx) {
            return null
        }
        const token = await this.getToken(doc, pos)
        if (!token) {
            return null
        }
        const symbol = this.getSymbol(token, result, rootFile, true)
        if (!symbol) {
            return null
        }
        const items: v.Location[] = []
        const results = await this.compileAllSourceFiles()
        for (const assembly of results) {
            for (const file of assembly.files) {
                const uri = v.Uri.file(file.source.path)
                for (const line of file.lines) {
                    if (line.lex && line.eval) {
                        const tokens = line.lex.tokens.filter(t => t.type === TokenType.identifier)
                        for (const t of tokens) {
                            if (!context.includeDeclaration && t === token) {
                                continue
                            }
                            const sym = this.getSymbol(t, assembly, file, true)
                            if (sym && sym.id === symbol.id) {
                                items.push(new v.Location(uri, new v.Position(t.line, t.col)))
                            }
                        }
                    }
                }
            }
        }
        return items
    }

    public async provideDocumentHighlights(doc: v.TextDocument, pos: v.Position, cancelToken: v.CancellationToken): Promise<v.DocumentHighlight[] | null | undefined> {
        const result = await this.assembleDoc(doc)
        if (!result) {
            return null
        }
        const file = await this.getFileContext(doc)
        if (!file) {
            return null
        }
        const evalCtx = file.lines[pos.line].eval
        if (!evalCtx) {
            return null
        }
        const token = await this.getToken(doc, pos)
        if (!token) {
            return null
        }
        const symbol = this.getSymbol(token, result, file)
        const items: v.DocumentHighlight[] = []
        for (const line of file.lines) {
            if (line.lex && line.eval) {
                if (symbol) {
                    const tokens = line.lex.tokens.filter(t => t.type === TokenType.identifier)
                    for (const t of tokens) {
                        const sym = this.getSymbol(t, result, file)
                        if (sym && sym.id === symbol.id) {
                            items.push(new v.DocumentHighlight(new v.Range(t.line, t.col, t.line, t.col + t.value.length)))
                        }
                    }
                } else {
                    const tokens = line.lex.tokens
                    for (const t of tokens) {
                        if (t.value === token.value) {
                            items.push(new v.DocumentHighlight(new v.Range(t.line, t.col, t.line, t.col + t.value.length)))
                        }
                    }
                }
            }
        }
        return items
    }

    public async provideDocumentSymbols(doc: v.TextDocument, cancelToken: v.CancellationToken): Promise<v.SymbolInformation[] | v.DocumentSymbol[] | null | undefined> {
        const result = await this.assembleDoc(doc)
        if (!result) {
            return null
        }
        const file = await this.getFileContext(doc)
        if (!file) {
            return null
        }
        const items: v.DocumentSymbol[] = []
        if (result.state.sections) {
            for (const sectionId of Object.keys(result.state.sections)) {
                const section = result.state.sections[sectionId]
                if (section.file !== doc.uri.fsPath) {
                    continue
                }
                const sectionSymbol = new v.DocumentSymbol(sectionId, 'section', v.SymbolKind.Namespace, new v.Range(section.startLine, 0, section.startLine, file.lines[section.startLine].source.text.length), new v.Range(section.startLine, 0, section.startLine, file.lines[section.startLine].source.text.length))
                if (result.state.labels) {
                    sectionSymbol.children = []
                    for (const labelId of Object.keys(result.state.labels)) {
                        const label = result.state.labels[labelId]
                        if (label.id.includes('.') || label.section !== sectionId || label.file !== doc.uri.fsPath) {
                            continue
                        }
                        const labelSymbol = new v.DocumentSymbol(labelId, 'global label', v.SymbolKind.Variable, new v.Range(label.startLine, 0, label.startLine, file.lines[label.startLine].source.text.length), new v.Range(label.startLine, 0, label.startLine, file.lines[label.startLine].source.text.length))
                        labelSymbol.children = []
                        for (const subLabelId of Object.keys(result.state.labels)) {
                            const subLabel = result.state.labels[subLabelId]
                            if (!subLabel.id.startsWith(`${labelId}.`) || subLabel.section !== sectionId || subLabel.file !== doc.uri.fsPath) {
                                continue
                            }
                            const subLabelSymbol = new v.DocumentSymbol(subLabelId.substr(subLabelId.indexOf('.')), 'local label', v.SymbolKind.Variable, new v.Range(subLabel.startLine, 0, subLabel.startLine, file.lines[subLabel.startLine].source.text.length), new v.Range(subLabel.startLine, 0, subLabel.startLine, file.lines[subLabel.startLine].source.text.length))
                            labelSymbol.children.push(subLabelSymbol)
                        }
                        sectionSymbol.children.push(labelSymbol)
                    }
                }
                items.push(sectionSymbol)
            }
        }
        if (result.state.numberEquates) {
            for (const id of Object.keys(result.state.numberEquates)) {
                const equ = result.state.numberEquates[id]
                if (equ.file !== doc.uri.fsPath) {
                    continue
                }
                items.push(new v.DocumentSymbol(id, 'equ', v.SymbolKind.Constant, new v.Range(equ.startLine, 0, equ.endLine, file.lines[equ.endLine].source.text.length), new v.Range(equ.startLine, 0, equ.startLine, file.lines[equ.startLine].source.text.length)))
            }
        }
        if (result.state.stringEquates) {
            for (const id of Object.keys(result.state.stringEquates)) {
                const equs = result.state.stringEquates[id]
                if (equs.file !== doc.uri.fsPath) {
                    continue
                }
                items.push(new v.DocumentSymbol(id, 'equs', v.SymbolKind.Constant, new v.Range(equs.startLine, 0, equs.endLine, file.lines[equs.endLine].source.text.length), new v.Range(equs.startLine, 0, equs.startLine, file.lines[equs.startLine].source.text.length)))
            }
        }
        if (result.state.sets) {
            for (const id of Object.keys(result.state.sets)) {
                const set = result.state.sets[id]
                if (set.file !== doc.uri.fsPath) {
                    continue
                }
                items.push(new v.DocumentSymbol(id, 'set', v.SymbolKind.Variable, new v.Range(set.startLine, 0, set.endLine, file.lines[set.endLine].source.text.length), new v.Range(set.startLine, 0, set.startLine, file.lines[set.startLine].source.text.length)))
            }
        }
        if (result.state.macros) {
            for (const id of Object.keys(result.state.macros)) {
                const macro = result.state.macros[id]
                if (macro.file !== doc.uri.fsPath) {
                    continue
                }
                items.push(new v.DocumentSymbol(id, 'macro', v.SymbolKind.Function, new v.Range(macro.startLine, 0, macro.endLine, file.lines[macro.endLine].source.text.length), new v.Range(macro.startLine, 0, macro.startLine, file.lines[macro.startLine].source.text.length)))
            }
        }
        return items
    }

    public async provideWorkspaceSymbols(query: string, cancelToken: v.CancellationToken): Promise<v.SymbolInformation[] | null | undefined> {
        const regex = new RegExp(`.*${query.split('').join('.*')}.*`, 'i')
        const items: v.SymbolInformation[] = []
        const results = await this.compileAllSourceFiles()
        for (const result of results) {
            for (const file of result.files) {
                const uri = v.Uri.file(file.source.path)
                if (result.state.sections) {
                    for (const id of Object.keys(result.state.sections)) {
                        const section = result.state.sections[id]
                        if (!regex.test(id) || section.file !== uri.fsPath) {
                            continue
                        }
                        items.push(new v.SymbolInformation(id, v.SymbolKind.Namespace, '', new v.Location(uri, new v.Range(section.startLine, 0, section.endLine, file.lines[section.endLine].source.text.length))))
                    }
                }
                if (result.state.labels) {
                    for (const id of Object.keys(result.state.labels)) {
                        const label = result.state.labels[id]
                        if (!regex.test(id) || label.file !== uri.fsPath) {
                            continue
                        }
                        items.push(new v.SymbolInformation(id, v.SymbolKind.Variable, '', new v.Location(uri, new v.Range(label.startLine, 0, label.endLine, file.lines[label.endLine].source.text.length))))
                    }
                }
                if (result.state.numberEquates) {
                    for (const id of Object.keys(result.state.numberEquates)) {
                        const equ = result.state.numberEquates[id]
                        if (!regex.test(id) || equ.file !== uri.fsPath) {
                            continue
                        }
                        items.push(new v.SymbolInformation(id, v.SymbolKind.Constant, '', new v.Location(uri, new v.Range(equ.startLine, 0, equ.endLine, file.lines[equ.endLine].source.text.length))))
                    }
                }
                if (result.state.stringEquates) {
                    for (const id of Object.keys(result.state.stringEquates)) {
                        const equs = result.state.stringEquates[id]
                        if (!regex.test(id) || equs.file !== uri.fsPath) {
                            continue
                        }
                        items.push(new v.SymbolInformation(id, v.SymbolKind.Constant, '', new v.Location(uri, new v.Range(equs.startLine, 0, equs.endLine, file.lines[equs.endLine].source.text.length))))
                    }
                }
                if (result.state.sets) {
                    for (const id of Object.keys(result.state.sets)) {
                        const set = result.state.sets[id]
                        if (!regex.test(id) || set.file !== uri.fsPath) {
                            continue
                        }
                        items.push(new v.SymbolInformation(id, v.SymbolKind.Variable, '', new v.Location(uri, new v.Range(set.startLine, 0, set.endLine, file.lines[set.endLine].source.text.length))))
                    }
                }
                if (result.state.macros) {
                    for (const id of Object.keys(result.state.macros)) {
                        const macro = result.state.macros[id]
                        if (!regex.test(id) || macro.file !== uri.fsPath) {
                            continue
                        }
                        items.push(new v.SymbolInformation(id, v.SymbolKind.Function, '', new v.Location(uri, new v.Range(macro.startLine, 0, macro.endLine, file.lines[macro.endLine].source.text.length))))
                    }
                }
            }
        }
        return items
    }

    public provideCodeActions(doc: v.TextDocument, range: v.Range | v.Selection, context: v.CodeActionContext, cancelToken: v.CancellationToken): v.ProviderResult<(v.Command | v.CodeAction)[]> {
        throw new Error('Method not implemented.')
    }

    public async provideCodeLenses(doc: v.TextDocument, cancelToken: v.CancellationToken): Promise<v.CodeLens[] | null | undefined> {
        if (!getSetting('hgbasm.analysisCodeLensEnabled')) {
            return null
        }
        const items: v.CodeLens[] = []
        const file = await this.getFileContext(doc)
        if (!file) {
            return null
        }
        const analysis = await this.host.analyze(doc.uri.fsPath)
        if (!analysis || !analysis.results) {
            return null
        }

        for (const item of analysis.results.sectionSizes.filter(r => r.symbol.file === doc.uri.fsPath && (r.display === 'all' || r.display === 'codelens'))) {
            items.push(new v.CodeLens(this.getSymbolRange(item.symbol, file), {
                title: new DocString(this)
                    .write('Size in bytes:')
                    .hex(item.value)
                    .dec(item.value).parenthesized()
                    .toString(),
                command: ''
            }))
        }

        for (const item of analysis.results.labelOffsets.filter(r => r.symbol.file === doc.uri.fsPath && (r.display === 'all' || r.display === 'codelens'))) {
            items.push(new v.CodeLens(this.getSymbolRange(item.symbol, file), {
                title: new DocString(this)
                    .write('Offset in section:')
                    .hex(item.value)
                    .dec(item.value).parenthesized()
                    .toString(),
                command: ''
            }))
        }

        for (const item of analysis.results.labelSizes.filter(r => r.symbol.file === doc.uri.fsPath && (r.display === 'all' || r.display === 'codelens'))) {
            items.push(new v.CodeLens(this.getSymbolRange(item.symbol, file), {
                title: new DocString(this)
                    .write('Size in bytes:')
                    .hex(item.value)
                    .dec(item.value).parenthesized()
                    .toString(),
                command: ''
            }))
        }

        return items
    }

    public async provideFoldingRanges(doc: v.TextDocument, context: v.FoldingContext, cancelToken: v.CancellationToken): Promise<v.FoldingRange[] | null | undefined> {
        const result = await this.assembleDoc(doc)
        if (!result) {
            return null
        }
        const file = await this.getFileContext(doc)
        if (!file) {
            return null
        }
        const items: v.FoldingRange[] = []
        if (result.state.sections) {
            for (const id of Object.keys(result.state.sections)) {
                const section = result.state.sections[id]
                if (section.file !== doc.uri.fsPath) {
                    continue
                }
                let endLine = section.endLine
                while (!file.lines[endLine].source.text.trim() || file.lines[endLine].source.text.startsWith(';')) {
                    endLine--
                }
                items.push(new v.FoldingRange(section.startLine, endLine, v.FoldingRangeKind.Region))
            }
        }
        if (result.state.labels) {
            for (const id of Object.keys(result.state.labels)) {
                const label = result.state.labels[id]
                if (label.file !== doc.uri.fsPath) {
                    continue
                }
                if (label.endLine < label.startLine) {
                    continue
                }
                let endLine = label.endLine
                while (!file.lines[endLine].source.text.trim() || file.lines[endLine].source.text.trim().startsWith(';')) {
                    endLine--
                }
                items.push(new v.FoldingRange(label.startLine, endLine, v.FoldingRangeKind.Region))
            }
        }
        return items
    }

    public provideDocumentColors(doc: v.TextDocument, cancelToken: v.CancellationToken): v.ProviderResult<v.ColorInformation[]> {
        throw new Error('Method not implemented.')
    }

    public provideColorPresentations(color: v.Color, context: { document: v.TextDocument, range: v.Range }, cancelToken: v.CancellationToken): v.ProviderResult<v.ColorPresentation[]> {
        throw new Error('Method not implemented.')
    }

    public async provideDocumentFormattingEdits(doc: v.TextDocument, options: v.FormattingOptions, cancelToken: v.CancellationToken): Promise<v.TextEdit[] | null | undefined> {
        return this.provideDocumentRangeFormattingEdits(doc, new v.Range(0, 0, doc.lineCount - 1, 0), options, cancelToken)
    }

    public async provideDocumentRangeFormattingEdits(doc: v.TextDocument, range: v.Range, options: v.FormattingOptions, cancelToken: v.CancellationToken): Promise<v.TextEdit[] | null | undefined> {
        if (!getSetting('hgbasm.formattingEnabled')) {
            return null
        }
        const items: v.TextEdit[] = []
        const result = await this.host.format(doc.uri.fsPath, range.start.line, range.end.line, options)
        if (!result) {
            return null
        }
        for (const d of result.deltas) {
            if (d.remove && d.add) {
                items.push(v.TextEdit.replace(new v.Range(d.line, d.column, d.line, d.column + d.remove), d.add))
            } else if (d.remove) {
                items.push(v.TextEdit.delete(new v.Range(d.line, d.column, d.line, d.column + d.remove)))
            } else if (d.add) {
                items.push(v.TextEdit.insert(new v.Position(d.line, d.column), d.add))
            }
        }
        return items
    }

    public provideOnTypeFormattingEdits(doc: v.TextDocument, pos: v.Position, ch: string, options: v.FormattingOptions, cancelToken: v.CancellationToken): v.ProviderResult<v.TextEdit[]> {
        return this.provideDocumentRangeFormattingEdits(doc, new v.Range(pos.line, 0, pos.line, 0), options, cancelToken)
    }

    public async provideRenameEdits(doc: v.TextDocument, pos: v.Position, newName: string, cancelToken: v.CancellationToken): Promise<v.WorkspaceEdit | null | undefined> {
        const result = await this.assembleDoc(doc)
        if (!result) {
            return null
        }
        const token = await this.getToken(doc, pos)
        if (!token) {
            return null
        }
        const rootFile = await this.getFileContext(doc)
        if (!rootFile) {
            return null
        }
        const evalCtx = rootFile.lines[token.line].eval
        if (!evalCtx) {
            return null
        }
        const symbol = await this.getSymbol(token, result, rootFile, true)
        if (!symbol) {
            return null
        }

        const isGlobal = !token.value.includes('.') || token.value.indexOf('.') > 0 || (newName.includes('.') && newName.indexOf('.') > 0)
        const isLocal = token.value.includes('.') && (!isGlobal || newName.includes('.'))
        const oldGlobal = symbol.id.includes('.') ? symbol.id.substr(0, symbol.id.indexOf('.')) : symbol.id
        const oldLocal = symbol.id.includes('.') ? symbol.id.substr(symbol.id.indexOf('.')) : ''

        const edit = new v.WorkspaceEdit()
        const results = await this.compileAllSourceFiles()
        for (const assembly of results) {
            for (const file of assembly.files) {
                const uri = v.Uri.file(file.source.path)
                for (const line of file.lines) {
                    if (line.lex && line.eval) {
                        const tokens = line.lex.tokens.filter(t => t.type === TokenType.identifier)
                        for (const t of tokens) {
                            const sym = this.getSymbol(t, assembly, file, true)
                            if (!sym) {
                                continue
                            }
                            const suffixes = t.value.includes(':') ? t.value.substr(t.value.indexOf(':')) : ''
                            const hasGlobal = !t.value.includes('.') || t.value.indexOf('.') > 0
                            const hasLocal = t.value.includes('.')
                            const symGlobal = sym.id.includes('.') ? sym.id.substr(0, sym.id.indexOf('.')) : sym.id
                            const symLocal = sym.id.includes('.') ? sym.id.substr(sym.id.indexOf('.')) : ''

                            let newGlobal = symGlobal
                            let newLocal = symLocal

                            if (hasGlobal && isGlobal && symGlobal === oldGlobal) {
                                newGlobal = newName.includes('.') ? newName.substr(0, newName.indexOf('.')) : newName
                            }

                            if (hasLocal && isLocal && symGlobal === oldGlobal && symLocal === oldLocal) {
                                newLocal = newName.includes('.') ? newName.substr(newName.indexOf('.')) : newName
                                if (!newLocal.startsWith('.')) {
                                    newLocal = `.${newLocal}`
                                }
                            }

                            if (newGlobal !== symGlobal || newLocal !== symLocal) {
                                const replacement = `${hasGlobal ? newGlobal : ''}${hasLocal ? newLocal : ''}${suffixes}`
                                edit.replace(uri, new v.Range(t.line, t.col, t.line, t.col + t.value.length), replacement)
                            }
                        }
                    }
                }
            }
        }
        return edit
    }
}
