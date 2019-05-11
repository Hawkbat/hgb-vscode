import * as v from 'vscode'

export default class Provider implements v.CompletionItemProvider, v.HoverProvider, v.SignatureHelpProvider, v.DefinitionProvider, v.ReferenceProvider, v.DocumentHighlightProvider, v.DocumentSymbolProvider, v.WorkspaceSymbolProvider, v.CodeActionProvider, v.CodeLensProvider, v.DocumentColorProvider, v.DocumentFormattingEditProvider, v.DocumentRangeFormattingEditProvider, v.OnTypeFormattingEditProvider, v.RenameProvider {
    public diagnostics: v.DiagnosticCollection | undefined
    public onDidChangeCodeLenses?: v.Event<void> | undefined

    public activate(ctx: v.ExtensionContext): void {
        this.diagnostics = v.languages.createDiagnosticCollection('hgbasm')
        ctx.subscriptions.push(this.diagnostics)
        v.window.showInformationMessage('Extension activated')
    }

    public deactivate(): void {
        v.window.showInformationMessage('Extension deactivated')
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
