import { AsmFile, Assembler, AssemblerContext, FileContext, IFileProvider, ILogPipe, Logger } from 'hgbasm'
import Analyzer from 'hgbasm/lib/Analyzer/Analyzer'
import AnalyzerContext from 'hgbasm/lib/Analyzer/AnalyzerContext'
import IAnalyzerOptions from 'hgbasm/lib/Analyzer/IAnalyzerOptions'
import IAssemblerOptions from 'hgbasm/lib/Assembler/IAssemblerOptions'
import AutoCompleter from 'hgbasm/lib/AutoCompleter/AutoCompleter'
import AutoCompleterContext from 'hgbasm/lib/AutoCompleter/AutoCompleterContext'
import IAutoCompleterOptions from 'hgbasm/lib/AutoCompleter/IAutoCompleterOptions'
import Formatter from 'hgbasm/lib/Formatter/Formatter'
import FormatterContext from 'hgbasm/lib/Formatter/FormatterContext'
import IFormatterOptions from 'hgbasm/lib/Formatter/IFormatterOptions'
import IProjectFile from 'hgbasm/lib/IProjectFile'
import IVersion from 'hgbasm/lib/IVersion'
import Token from 'hgbasm/lib/Token'
import SourceFile from './SourceFile'

interface IVersionProvider {
    getHgbasmVersion(): IVersion
}

export default class Host {
    public project: IProjectFile | null = null
    public files: { [key: string]: SourceFile } = {}
    public provider: IFileProvider & ILogPipe & IVersionProvider
    public assembler: Assembler
    public assemblerLogger: Logger
    public formatter: Formatter
    public formatterLogger: Logger
    public analyzer: Analyzer
    public analyzerLogger: Logger
    public autoCompleter: AutoCompleter
    public autoCompleterLogger: Logger

    constructor(provider: IFileProvider & ILogPipe & IVersionProvider) {
        this.provider = provider
        this.assemblerLogger = new Logger(this.provider, 'warn')
        this.assembler = new Assembler(this.assemblerLogger)
        this.formatterLogger = new Logger(this.provider, 'warn')
        this.formatter = new Formatter(this.formatterLogger)
        this.analyzerLogger = new Logger(this.provider, 'warn')
        this.analyzer = new Analyzer(this.analyzerLogger)
        this.autoCompleterLogger = new Logger(this.provider, 'warn')
        this.autoCompleter = new AutoCompleter(this.autoCompleterLogger)
    }

    public register(path: string, source: string | Uint8Array, parent?: SourceFile | null): SourceFile {
        if (this.files[path]) {
            this.files[path].file = new AsmFile(path, source)
            this.files[path].result = null
        } else {
            this.files[path] = new SourceFile(new AsmFile(path, source))
        }
        if (parent !== undefined) {
            this.files[path].parent = parent
            this.files[path].result = null
        }
        let file = this.files[path]
        file.result = null
        while (file.parent) {
            file = file.parent
            file.result = null
        }
        return this.files[path]
    }

    public getFile(path: string): SourceFile | null {
        if (this.files[path]) {
            return this.files[path]
        }
        return null
    }

    public deleteFile(path: string): void {
        if (this.files[path]) {
            delete this.files[path]
        }
    }

    public setProject(project: IProjectFile | null): void {
        this.project = project
        this.assemblerLogger.level = this.project && this.project.assembler && this.project.assembler.logLevel ? this.project.assembler.logLevel : 'warn'
        this.files = {}
    }

    public getSourcePaths(): string[] {
        return this.project && this.project.assembler && this.project.assembler.sourcePaths ? this.project.assembler.sourcePaths : ['src/*.{asm,s,z80,gbz80,sm83,hgb}']
    }

    public getIncludePaths(): string[] {
        return this.project && this.project.assembler && this.project.assembler.includePaths ? this.project.assembler.includePaths : ['inc/**/']
    }

    public getFileContext(path: string, ctx: AssemblerContext): FileContext | null {
        const file = ctx.files.find(f => f.source.path === path)
        if (!file) {
            return null
        }
        return file
    }

    public getAssemblerSettings(): IAssemblerOptions {
        return {
            padding: 0,
            exportAllLabels: false,
            nopAfterHalt: true,
            optimizeLd: false,
            debugDefineName: '',
            debugDefineValue: '1',
            version: this.provider.getHgbasmVersion(),
            ...(this.project && this.project.assembler && this.project.assembler.settings ? this.project.assembler.settings : {})
        }
    }

    public async assemble(path: string, refresh: boolean): Promise<AssemblerContext | null> {
        if (!this.files[path]) {
            return null
        }
        const file = this.files[path]
        if (file.parent) {
            return this.assemble(file.parent.file.path, refresh)
        }
        if (!refresh) {
            const existingResult = this.files[path].result
            if (existingResult) {
                return existingResult
            }
        }
        const fileCtx = new FileContext(this.files[path].file)
        const ctx = new AssemblerContext(this.assembler, this.getAssemblerSettings(), fileCtx, this.provider)
        const result = await this.assembler.assemble(ctx)
        this.files[path].result = result
        return result
    }

    public getFormatterSettings(options: { insertSpaces: boolean, tabSize: number } = { insertSpaces: true, tabSize: 4 }): IFormatterOptions {
        return {
            useSpaces: options.insertSpaces,
            tabSize: options.tabSize,
            keywordCase: 'preserve',
            opcodeCase: 'preserve',
            pseudoOpCase: 'preserve',
            conditionCodeCase: 'preserve',
            registerCase: 'preserve',
            functionCase: 'preserve',
            regionCase: 'preserve',
            hexLetterCase: 'preserve',
            ...(this.project && this.project.formatter && this.project.formatter.settings ? this.project.formatter.settings : {})
        }
    }

    public async format(path: string, startLine: number, endLine: number, options: { insertSpaces: boolean, tabSize: number }): Promise<FormatterContext | null> {
        const asmCtx = await this.assemble(path, false)
        if (!asmCtx) {
            return null
        }
        if (asmCtx.diagnostics.some(d => d.line && d.line.file.source.path === path && d.line.lineNumber >= startLine && d.line.lineNumber <= endLine)) {
            return null
        }
        const file = this.getFileContext(path, asmCtx)
        if (!file) {
            return null
        }
        const ctx = new FormatterContext(this.getFormatterSettings(options), file, startLine, endLine)
        return this.formatter.format(ctx)
    }

    public getAnalyzerSettings(): IAnalyzerOptions {
        return {
            sectionSizes: 'all',
            globalLabelOffsets: 'hover',
            globalLabelSizes: 'hover',
            localLabelOffsets: 'hover',
            localLabelSizes: 'hover',
            ...(this.project && this.project.analyzer && this.project.analyzer.settings ? this.project.analyzer.settings : {})
        }
    }

    public async analyze(path: string): Promise<AnalyzerContext | null> {
        const asmCtx = await this.assemble(path, false)
        if (!asmCtx) {
            return null
        }
        const ctx = new AnalyzerContext(this.getAnalyzerSettings(), asmCtx)
        return this.analyzer.analyze(ctx)
    }

    public getAutoCompleterSettings(): IAutoCompleterOptions {
        return {
            keywords: true,
            instructions: true,
            functions: true,
            regions: true,
            predefines: true,
            numberEquates: true,
            stringEquates: true,
            sets: true,
            labels: true,
            macros: true,
            ...(this.project && this.project.autoCompleter && this.project.autoCompleter.settings ? this.project.autoCompleter.settings : {})
        }
    }

    public async autoComplete(path: string, previous: Token | null): Promise<AutoCompleterContext | null> {
        const asmCtx = await this.assemble(path, false)
        if (!asmCtx) {
            return null
        }
        const ctx = new AutoCompleterContext(this.getAutoCompleterSettings(), asmCtx, previous)
        return this.autoCompleter.autoComplete(ctx)
    }
}
