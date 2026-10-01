import * as coc from 'coc.nvim'
import { formatWorkspace, GolinesFormattingEditProvider } from './formatter'
import { ensureGolinesExists, reinstallGolines } from './installer'
import { getConfiguration } from './util'

let registration: coc.Disposable | undefined

const setupFormatter = (storagePath: string): coc.Disposable => {
  const provider = new GolinesFormattingEditProvider(async () => ensureGolinesExists(storagePath))
  return coc.languages.registerDocumentFormatProvider(
    [{ language: 'go', scheme: 'file' }],
    provider,
    999,
  )
}

export async function activate(context: coc.ExtensionContext): Promise<void> {
  const reload = (): void => {
    registration?.dispose()
    registration = undefined
    if (getConfiguration().get<boolean>('enable', true)) {
      registration = setupFormatter(context.storagePath)
    }
  }

  context.subscriptions.push(
    coc.commands.registerCommand('golines.reinstall', async () => {
      await reinstallGolines(context.storagePath)
    }),
    coc.commands.registerCommand('golines.formatWorkspace', async () => {
      await formatWorkspace(async () => ensureGolinesExists(context.storagePath))
    }),
    coc.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration('golines')) {
        reload()
      }
    }),
    {
      dispose: () => {
        registration?.dispose()
      },
    },
  )

  reload()
}

export function deactivate(): void {
  registration?.dispose()
  registration = undefined
}
