import path from 'node:path'
import * as coc from 'coc.nvim'
import { calcPatch } from 'fast-myers-diff'
import { runCommand } from './golines'
import { errorMessage, getCustomArgs } from './util'

const findLine = (lineLengths: number[], pos: number, startLine: number): [number, number] => {
  let low = startLine
  let high = lineLengths.length - 1
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2)
    if (lineLengths[mid] <= pos) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  const char = low > 0 ? lineLengths[low - 1] : 0
  return [low, char]
}

export class GolinesFormattingEditProvider implements coc.DocumentFormattingEditProvider {
  constructor(private getBinaryPath: () => Promise<string | undefined>) {}

  public async provideDocumentFormattingEdits(document: coc.TextDocument): Promise<coc.TextEdit[]> {
    const bin = await this.getBinaryPath()
    if (!bin) {
      return []
    }

    const customArgs = getCustomArgs()
    const currentWorkspace = coc.workspace.getWorkspaceFolder(document.uri)
    const cwd = currentWorkspace
      ? path.normalize(coc.Uri.parse(currentWorkspace.uri).fsPath)
      : undefined
    const text = document.getText()

    let formattedText: string
    try {
      const { stdout } = await runCommand(bin, customArgs, text, cwd)
      formattedText = stdout
    } catch (error) {
      coc.window.showErrorMessage(`golines failed to format: ${errorMessage(error)}`)
      return []
    }

    if (!formattedText || formattedText === text) {
      return []
    }

    const patch = calcPatch(text, formattedText)
    const lines = text.split('\n')
    const lineLengths: number[] = []
    let cumulativeLength = 0
    for (const line of lines) {
      cumulativeLength += line.length + 1
      lineLengths.push(cumulativeLength)
    }

    const edits: coc.TextEdit[] = []
    let lastLine = 0
    for (const [start, end, newSubstr] of patch) {
      const [lineStart, charToLineStart] = findLine(lineLengths, start, lastLine)
      const [lineEnd, charToLineEnd] = findLine(lineLengths, end, lineStart)
      const charStart = start - charToLineStart
      const charEnd = end - charToLineEnd
      const range = coc.Range.create(
        coc.Position.create(lineStart, charStart),
        coc.Position.create(lineEnd, charEnd),
      )
      lastLine = lineEnd
      edits.push(coc.TextEdit.replace(range, newSubstr))
    }

    return edits
  }
}

export const formatWorkspace = async (
  getBinaryPath: () => Promise<string | undefined>,
): Promise<void> => {
  const bin = await getBinaryPath()
  if (!bin) {
    return
  }

  const rootUri = coc.workspace.workspaceFolders[0]?.uri
  const rootPath = rootUri ? coc.Uri.parse(rootUri).fsPath : undefined
  if (!rootPath) {
    coc.window.showWarningMessage('No workspace folder found')
    return
  }

  await coc.window.withProgress(
    { title: 'Formatting Go files in workspace with golines...', cancellable: false },
    async () => {
      try {
        const customArgs = getCustomArgs()
        const args = [...customArgs, '-w', '.']
        await runCommand(bin, args, undefined, rootPath)
        coc.window.showInformationMessage('Workspace formatted successfully')
      } catch (error) {
        coc.window.showErrorMessage(`Failed to format workspace: ${errorMessage(error)}`)
      }
    },
  )
}
