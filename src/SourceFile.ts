import { AsmFile, AssemblerContext } from 'hgbasm'

export default class SourceFile {
    public file: AsmFile
    public parent: SourceFile | null = null
    public result: AssemblerContext | null = null

    constructor(file: AsmFile) {
        this.file = file
    }
}
