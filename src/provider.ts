import * as fs from 'fs-extra'
import { AsmFile, IFileProvider, ILogPipe } from 'hgbasm'
import * as pathUtil from 'path'
import * as v from 'vscode'
import Host from './host'

// tslint:disable: no-console

const LANGUAGE_ID = 'hgbasm'

export default class Provider implements v.CompletionItemProvider, v.HoverProvider, v.SignatureHelpProvider, v.DefinitionProvider, v.ReferenceProvider, v.DocumentHighlightProvider, v.DocumentSymbolProvider, v.WorkspaceSymbolProvider, v.CodeActionProvider, v.CodeLensProvider, v.DocumentColorProvider, v.DocumentFormattingEditProvider, v.DocumentRangeFormattingEditProvider, v.OnTypeFormattingEditProvider, v.RenameProvider, ILogPipe, IFileProvider {
    public allowAnsi: boolean = false
    public host: Host
    public diagnostics: v.DiagnosticCollection | undefined
    public onDidChangeCodeLenses?: v.Event<void> | undefined

    constructor() {
        this.host = new Host(this)
    }

    public log(msg: string, type: string): void {
        if (type === 'error' || type === 'fatal') {
            console.error(msg)
        } else {
            console.log(msg)
        }
    }

    public async retrieve(path: string, sender: AsmFile, binary: boolean): Promise<AsmFile | null> {
        if (v.workspace.workspaceFolders) {
            for (const rootFolder of v.workspace.workspaceFolders.map(f => f.uri.fsPath)) {
                const sourcePath = rootFolder
                const includeFolders = [rootFolder]
                try {
                    const filePath = pathUtil.resolve(rootFolder, path)
                    const contents = await fs.readFile(filePath, binary ? 'binary' : 'utf8')
                    return new AsmFile(pathUtil.relative(rootFolder, filePath), contents)
                } catch (_) {
                    // file does not exist or could not be accessed; continue
                }
                try {
                    const filePath = pathUtil.resolve(pathUtil.dirname(sender.path), path)
                    const contents = await fs.readFile(filePath, binary ? 'binary' : 'utf8')
                    return new AsmFile(pathUtil.relative(rootFolder, filePath), contents)
                } catch (_) {
                    // file does not exist or could not be accessed; continue
                }
                try {
                    const filePath = pathUtil.resolve(pathUtil.dirname(sourcePath), path)
                    const contents = await fs.readFile(filePath, binary ? 'binary' : 'utf8')
                    return new AsmFile(pathUtil.relative(rootFolder, filePath), contents)
                } catch (_) {
                    // file does not exist or could not be accessed; continue
                }
                for (const incPath of includeFolders) {
                    try {
                        const filePath = pathUtil.resolve(incPath, path)
                        const contents = await fs.readFile(filePath, binary ? 'binary' : 'utf8')
                        return new AsmFile(pathUtil.relative(rootFolder, filePath), contents)
                    } catch (_) {
                        // file does not exist or could not be accessed; continue
                    }
                }
            }
        }
        try {
            const files = await v.workspace.findFiles(`**/${path}`)
            if (files.length > 0) {
                if (binary) {
                    return new AsmFile(files[0].fsPath, new Uint8Array(0))
                } else {
                    const doc = await v.workspace.openTextDocument(files[0])
                    return new AsmFile(doc.uri.fsPath, doc.getText())
                }
            }
        } catch (_) {
            // file does not exist or could not be accessed; continue
        }
        return null
    }

    public activate(ctx: v.ExtensionContext): void {
        this.diagnostics = v.languages.createDiagnosticCollection(LANGUAGE_ID)
        ctx.subscriptions.push(this.diagnostics)

        for (const doc of v.workspace.textDocuments) {
            if (doc.languageId === LANGUAGE_ID) {
                this.recompileTextDocument(doc)
            }
        }

        ctx.subscriptions.push(v.workspace.onDidOpenTextDocument(e => this.recompileTextDocument(e)))
        ctx.subscriptions.push(v.workspace.onDidChangeTextDocument(e => this.updateTextDocument(e.document)))
    }

    public async recompileTextDocument(doc: v.TextDocument): Promise<void> {
        if (doc.languageId !== LANGUAGE_ID || doc.uri.fsPath.endsWith('.git')) {
            return
        }
        const result = await this.host.assemble(doc.uri.fsPath, doc.getText())
        if (this.diagnostics) {
            this.diagnostics.set(doc.uri, result.diagnostics.filter(d => {
                const path = d.line ? d.line.file.source.path : null
                return path === doc.uri.fsPath
            }).map(d => {
                const startLine = d.line ? d.line.lineNumber : d.token ? d.token.line : 0
                const endLine = startLine
                const startCol = d.token ? d.token.col : 0
                const endCol = d.token ? d.token.col + d.token.value.length : Infinity
                console.log(d.toString())

                const severity = d.type === 'error' ? v.DiagnosticSeverity.Error :
                    d.type === 'warn' ? v.DiagnosticSeverity.Warning :
                        v.DiagnosticSeverity.Information
                return new v.Diagnostic(new v.Range(startLine, startCol, endLine, endCol), d.msg, severity)
            }))
        }
    }

    public async updateTextDocument(doc: v.TextDocument): Promise<void> {
        if (doc.uri.fsPath.endsWith('.git')) {
            return
        }
        this.host.files[doc.uri.fsPath] = new AsmFile(doc.uri.fsPath, doc.getText())
        this.recompileTextDocument(doc)
    }

    public deactivate(): void {
        this.host.files = {}
    }

    public provideCompletionItems(document: v.TextDocument, position: v.Position, token: v.CancellationToken, context: v.CompletionContext): v.ProviderResult<v.CompletionItem[] | v.CompletionList> {
        throw new Error('Method not implemented.')
    }

    public provideHover(document: v.TextDocument, position: v.Position, token: v.CancellationToken): v.ProviderResult<v.Hover> {
        throw new Error('Method not implemented.')
    }

    public provideSignatureHelp(document: v.TextDocument, position: v.Position, token: v.CancellationToken, context: v.SignatureHelpContext): v.ProviderResult<v.SignatureHelp> {
        throw new Error('Method not implemented.')
    }

    public provideDefinition(document: v.TextDocument, position: v.Position, token: v.CancellationToken): v.ProviderResult<v.Location | v.Location[] | v.LocationLink[]> {
        throw new Error('Method not implemented.')
    }

    public provideReferences(document: v.TextDocument, position: v.Position, context: v.ReferenceContext, token: v.CancellationToken): v.ProviderResult<v.Location[]> {
        throw new Error('Method not implemented.')
    }

    public provideDocumentHighlights(document: v.TextDocument, position: v.Position, token: v.CancellationToken): v.ProviderResult<v.DocumentHighlight[]> {
        throw new Error('Method not implemented.')
    }

    public provideDocumentSymbols(document: v.TextDocument, token: v.CancellationToken): v.ProviderResult<v.SymbolInformation[] | v.DocumentSymbol[]> {
        throw new Error('Method not implemented.')
    }

    public provideWorkspaceSymbols(query: string, token: v.CancellationToken): v.ProviderResult<v.SymbolInformation[]> {
        throw new Error('Method not implemented.')
    }

    public provideCodeActions(document: v.TextDocument, range: v.Range | v.Selection, context: v.CodeActionContext, token: v.CancellationToken): v.ProviderResult<(v.Command | v.CodeAction)[]> {
        throw new Error('Method not implemented.')
    }

    public provideCodeLenses(document: v.TextDocument, token: v.CancellationToken): v.ProviderResult<v.CodeLens[]> {
        throw new Error('Method not implemented.')
    }

    public provideDocumentColors(document: v.TextDocument, token: v.CancellationToken): v.ProviderResult<v.ColorInformation[]> {
        throw new Error('Method not implemented.')
    }
    public provideColorPresentations(color: v.Color, context: { document: v.TextDocument, range: v.Range }, token: v.CancellationToken): v.ProviderResult<v.ColorPresentation[]> {
        throw new Error('Method not implemented.')
    }

    public provideDocumentFormattingEdits(document: v.TextDocument, options: v.FormattingOptions, token: v.CancellationToken): v.ProviderResult<v.TextEdit[]> {
        throw new Error('Method not implemented.')
    }

    public provideDocumentRangeFormattingEdits(document: v.TextDocument, range: v.Range, options: v.FormattingOptions, token: v.CancellationToken): v.ProviderResult<v.TextEdit[]> {
        throw new Error('Method not implemented.')
    }

    public provideOnTypeFormattingEdits(document: v.TextDocument, position: v.Position, ch: string, options: v.FormattingOptions, token: v.CancellationToken): v.ProviderResult<v.TextEdit[]> {
        throw new Error('Method not implemented.')
    }

    public provideRenameEdits(document: v.TextDocument, position: v.Position, newName: string, token: v.CancellationToken): v.ProviderResult<v.WorkspaceEdit> {
        throw new Error('Method not implemented.')
    }

}
