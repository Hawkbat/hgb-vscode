import * as v from 'vscode'
import Provider from './Provider'

const provider = new Provider()

export function activate(context: v.ExtensionContext): void {
    provider.activate(context)
}

export function deactivate(): void {
    provider.deactivate()
}
