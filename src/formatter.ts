import * as fs from 'node:fs'
import path from 'node:path'
import * as coc from 'coc.nvim'
import { runCommand } from './golines'
import { errorMessage, getCustomArgs } from './util'

export class GolinesFormattingEditProvider implements coc.DocumentFormattingEditProvider {
  constructor(private getBinaryPath: () => Promise<string | undefined>) {}

  private async formatViaStdout(
    bin: string,
    args: string[],
    text: string,
    cwd?: string,
  ): Promise<string> {
    const { stdout } = await runCommand(bin, args, text, cwd)
    return stdout
  }

  private async formatViaFile(
    bin: string,
    args: string[],
    filePath: string,
    cwd?: string,
  ): Promise<string> {
    const tempDir = await fs.promises.mkdtemp(path.join(path.dirname(filePath), '.golines-tmp-'))
    const tempFile = path.join(tempDir, path.basename(filePath))
    try {
      await fs.promises.copyFile(filePath, tempFile)
      const fileArgs = [...args, '-w', tempFile]
      await runCommand(bin, fileArgs, undefined, cwd)
      return await fs.promises.readFile(tempFile, 'utf8')
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  public async provideDocumentFormattingEdits(
    document: coc.TextDocument,
  ): Promise<coc.TextEdit[]> {
    const bin = await this.getBinaryPath()
    if (!bin) {
      return []
    }

    const customArgs = getCustomArgs()
    const currentWorkspace = coc.workspace.getWorkspaceFolder(document.uri)
    const cwd = currentWorkspace ? path.normalize(coc.Uri.parse(currentWorkspace.uri).fsPath) : undefined
    const text = document.getText()
    const filePath = coc.Uri.parse(document.uri).fsPath

    let formattedText: string | undefined
    try {
      try {
        formattedText = await this.formatViaStdout(bin, customArgs, text, cwd)
      } catch (stdoutError) {
        if (!filePath || !fs.existsSync(filePath)) {
          throw stdoutError
        }
        formattedText = await this.formatViaFile(bin, customArgs, filePath, cwd)
      }
    } catch (error) {
      coc.window.showErrorMessage(`golines failed to format: ${errorMessage(error)}`)
      return []
    }

    if (!formattedText || formattedText === text) {
      return []
    }

    const doc = coc.workspace.getDocument(document.uri)
    const lineCount = doc?.lineCount ?? document.lineCount
    const lastLine = lineCount - 1
    const lastLineLength = doc ? doc.getline(lastLine).length : (document.getText().split(/\r?\n/)[lastLine]?.length ?? 0)
    const fullRange = coc.Range.create(
      { line: 0, character: 0 },
      { line: lastLine, character: lastLineLength },
    )

    return [coc.TextEdit.replace(fullRange, formattedText)]
  }
}
