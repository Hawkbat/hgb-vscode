import { AsmFile, Assembler, AssemblerContext, FileContext, IFileProvider, ILogPipe, Logger } from 'hgbasm'
import Formatter from 'hgbasm/lib/Formatter/Formatter'
import FormatterContext from 'hgbasm/lib/Formatter/FormatterContext'
import IFormatterOptions from 'hgbasm/lib/Formatter/IFormatterOptions'
import IProjectFile from 'hgbasm/lib/IProjectFile'
import IVersion from 'hgbasm/lib/IVersion'

interface IVersionProvider {
    getHgbasmVersion(): IVersion
}

export default class Host {
    public project: IProjectFile | null = null
    public files: { [key: string]: AsmFile } = {}
    public results: { [key: string]: AssemblerContext } = {}
    public provider: IFileProvider & ILogPipe & IVersionProvider
    public assembler: Assembler
    public assemblerLogger: Logger
    public formatter: Formatter
    public formatterLogger: Logger

    constructor(provider: IFileProvider & ILogPipe & IVersionProvider) {
        this.provider = provider
        this.assemblerLogger = new Logger(this.provider, 'warn')
        this.assembler = new Assembler(this.assemblerLogger)
        this.formatterLogger = new Logger(this.provider, 'warn')
        this.formatter = new Formatter(this.formatterLogger)
    }

    public register(path: string, source: string | Uint8Array): AsmFile {
        if (this.results[path]) {
            delete this.results[path]
        }
        this.files[path] = new AsmFile(path, source)
        return this.files[path]
    }

    public getFile(path: string): AsmFile | null {
        if (this.files[path]) {
            return this.files[path]
        }
        return null
    }

    public deleteFile(path: string): void {
        if (this.files[path]) {
            delete this.files[path]
        }
        if (this.results[path]) {
            delete this.results[path]
        }
    }

    public setProject(project: IProjectFile | null): void {
        this.project = project
        this.assemblerLogger.level = this.project && this.project.assembler && this.project.assembler.logLevel ? this.project.assembler.logLevel : 'warn'
        this.results = {}
    }

    public async assemble(path: string): Promise<AssemblerContext> {
        if (!this.files[path]) {
            throw new Error(`File must be registered: ${path}`)
        }

        if (this.results[path]) {
            return this.results[path]
        }

        const projectSettings = this.project && this.project.assembler && this.project.assembler.settings ? this.project.assembler.settings : {}

        const options = {
            debugDefineName: '',
            debugDefineValue: '',
            nopAfterHalt: true,
            optimizeLd: false,
            padding: 0xFF,
            exportAllLabels: false,
            version: this.provider.getHgbasmVersion(),
            ...projectSettings
        }

        const fileCtx = new FileContext(this.files[path])
        const ctx = new AssemblerContext(this.assembler, options, fileCtx, this.provider)

        const result = await this.assembler.assemble(ctx)

        this.results[path] = result

        return result
    }

    public async format(path: string, startLine: number, endLine: number, options: IFormatterOptions): Promise<FormatterContext> {
        if (!this.files[path]) {
            throw new Error(`File must be registered: ${path}`)
        }

        const projectSettings = this.project && this.project.formatter && this.project.formatter.settings ? this.project.formatter.settings : {}

        const opts: IFormatterOptions = {
            ...options,
            ...projectSettings
        }

        let asmCtx = this.results[path]
        if (!asmCtx) {
            asmCtx = await this.assemble(path)
        }

        const ctx = new FormatterContext(opts, asmCtx.file, startLine, endLine)
        return this.formatter.format(ctx)
    }
}
