import * as fs from 'node:fs'
import * as os from 'node:os'
import * as coc from 'coc.nvim'

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.promises.stat(filePath)
    return true
  } catch {
    return false
  }
}

export const ensureDirectory = async (directory: string): Promise<void> => {
  await fs.promises.mkdir(directory, { recursive: true })
}

export const executableName = (): string => (os.platform() === 'win32' ? 'golines.exe' : 'golines')

export const getConfiguration = (): coc.WorkspaceConfiguration =>
  coc.workspace.getConfiguration('golines')

export const getOptionalString = (key: string): string | undefined => {
  const value = getConfiguration().get<string | null>(key)
  const trimmed = value?.trim()
  return trimmed || undefined
}

export const getCustomArgs = (): string[] => {
  const value = getConfiguration().get<string | string[]>('args')
  if (Array.isArray(value)) {
    return value.map(arg => arg.trim()).filter(Boolean)
  }
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : []
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
