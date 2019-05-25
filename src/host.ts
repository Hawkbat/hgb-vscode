import { AsmFile, Assembler, AssemblerContext, FileContext, IFileProvider, ILogPipe, Logger } from 'hgbasm'

export default class Host {
    public files: { [key: string]: AsmFile } = {}
    public provider: IFileProvider & ILogPipe
    public assembler: Assembler
    public logger: Logger

    constructor(provider: IFileProvider & ILogPipe) {
        this.provider = provider
        this.logger = new Logger(this.provider, 'fatal')
        this.assembler = new Assembler(this.logger)
    }

    public async assemble(path: string, source: string): Promise<AssemblerContext> {
        if (!this.files[path]) {
            this.files[path] = new AsmFile(path, source)
        }
        const fileCtx = new FileContext(this.files[path])
        const ctx = new AssemblerContext(this.assembler, {
            debugDefineName: 'DEBUG',
            debugDefineValue: '1',
            nopAfterHalt: true,
            optimizeLd: false,
            padding: 0xFF,
            exportAllLabels: true,
            version: { major: 1, minor: 10, patch: 1 }
        }, fileCtx, this.provider)

        return this.assembler.assemble(ctx)
    }
}
