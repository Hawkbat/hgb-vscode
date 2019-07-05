import * as v from 'vscode'

export const LANGUAGE_ID = 'hgbasm'

export interface ISettings {
    'hgbasm.analysisHoverEnabled': boolean,
    'hgbasm.analysisCodeLensEnabled': boolean,
    'hgbasm.formattingEnabled': boolean,
    'hgbasm.autoCompleteEnabled': boolean,
}

export function getSetting<K extends keyof ISettings>(key: K): ISettings[K] {
    return v.workspace.getConfiguration().get(key) as ISettings[K]
}
