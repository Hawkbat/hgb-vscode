import * as v from 'vscode'

export const LANGUAGE_ID = 'hgbasm'

export type InfoStyle = 'codelens' | 'hover' | 'all' | 'none'
export type CapsStyle = 'uppercase' | 'lowercase' | 'preserve'

export interface ISettings {
    'hgbasm.project.sourcePath': string,
    'hgbasm.project.includePath': string,
    'hgbasm.project.configPath': string,
    'hgbasm.analysis.sectionSizes': InfoStyle,
    'hgbasm.analysis.globalLabelOffsets': InfoStyle,
    'hgbasm.analysis.globalLabelSizes': InfoStyle,
    'hgbasm.analysis.localLabelOffsets': InfoStyle,
    'hgbasm.analysis.localLabelSizes': InfoStyle,
    'hgbasm.formatting.enabled': boolean,
    'hgbasm.formatting.keywords': CapsStyle,
    'hgbasm.formatting.opcodes': CapsStyle,
    'hgbasm.formatting.psuedoOps': CapsStyle,
    'hgbasm.formatting.conditionCodes': CapsStyle,
    'hgbasm.formatting.registers': CapsStyle,
    'hgbasm.formatting.functions': CapsStyle,
    'hgbasm.formatting.regions': CapsStyle,
    'hgbasm.formatting.hexLetters': CapsStyle,
    'hgbasm.autoComplete.keywords': boolean,
    'hgbasm.autoComplete.instructions': boolean,
    'hgbasm.autoComplete.functions': boolean,
    'hgbasm.autoComplete.regions': boolean,
    'hgbasm.autoComplete.predefines': boolean,
    'hgbasm.autoComplete.numberEquates': boolean,
    'hgbasm.autoComplete.stringEquates': boolean,
    'hgbasm.autoComplete.sets': boolean,
    'hgbasm.autoComplete.labels': boolean,
    'hgbasm.autoComplete.macros': boolean
}

export function getSetting<K extends keyof ISettings>(key: K): ISettings[K] {
    return v.workspace.getConfiguration().get(key) as ISettings[K]
}
