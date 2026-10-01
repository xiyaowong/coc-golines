import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import * as coc from 'coc.nvim'
import { getGolinesVersion } from './golines'
import {
  ensureDirectory,
  errorMessage,
  executableName,
  fileExists,
  getConfiguration,
  getOptionalString,
} from './util'

const RELEASES_API = 'https://api.github.com/repos/golangci/golines/releases'
const USER_AGENT = 'coc-golines'
const REQUEST_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'application/vnd.github+json',
}
const REQUEST_TIMEOUT = 30_000
const DOWNLOAD_TIMEOUT = 300_000
const PAGE_SIZE = 100
const MAX_PAGES = 10

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

interface GolinesRelease {
  tag_name: string
  html_url: string
  assets: ReleaseAsset[]
}

const requestJson = async <T>(url: string): Promise<T> =>
  (await coc.fetch(url, { headers: REQUEST_HEADERS, timeout: REQUEST_TIMEOUT })) as T

const normalizeTag = (version: string): string =>
  version.startsWith('v') ? version : `v${version}`

const listReleases = async (): Promise<GolinesRelease[]> => {
  const releases: GolinesRelease[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await requestJson<GolinesRelease[]>(
      `${RELEASES_API}?per_page=${PAGE_SIZE}&page=${page}`,
    )
    releases.push(...batch)
    if (batch.length < PAGE_SIZE) {
      break
    }
  }
  return releases
}

const getRelease = async (version: string): Promise<GolinesRelease> => {
  if (version === 'latest') {
    return requestJson<GolinesRelease>(`${RELEASES_API}/latest`)
  }

  const tag = normalizeTag(version)
  try {
    return await requestJson<GolinesRelease>(`${RELEASES_API}/tags/${encodeURIComponent(tag)}`)
  } catch {
    // Partial versions fall back to prefix matching below.
  }

  const releases = await listReleases()
  const release
    = releases.find(item => item.tag_name === tag)
      ?? releases.find(item => item.tag_name.startsWith(`${tag}.`))
  if (!release) {
    throw new Error(`No golines release matches "${version}"`)
  }
  return release
}

const PLATFORM_TOKENS: Record<string, RegExp> = {
  win32: /(windows|win64|win32)/i,
  linux: /linux/i,
  darwin: /(darwin|macos)/i,
}

const ARCH_TOKENS: Record<string, RegExp> = {
  x64: /(amd64|x86_64|x64)/i,
  arm64: /(arm64|aarch64)/i,
}

const assetScore = (name: string): number => {
  if (!/^golines.*(?:\.zip|\.tar\.gz)$/i.test(name)) {
    return 0
  }

  const platform = PLATFORM_TOKENS[os.platform()]
  if (!platform?.test(name)) {
    return 0
  }

  if (os.platform() === 'darwin' && /darwin-all/i.test(name)) {
    return 3
  }

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (ARCH_TOKENS[arch].test(name)) {
    return 3
  }

  return 0
}

const selectAsset = (release: GolinesRelease): ReleaseAsset => {
  let selected: { asset: ReleaseAsset, score: number } | undefined
  for (const asset of release.assets) {
    const score = assetScore(asset.name)
    if (score > 0 && (!selected || score > selected.score)) {
      selected = { asset, score }
    }
  }

  if (!selected) {
    const available = release.assets.map(asset => asset.name).join(', ') || '(none)'
    throw new Error(
      `No golines asset for ${os.platform()}-${process.arch} in release ${release.tag_name}: ${available}`,
    )
  }
  return selected.asset
}

const locateBinary = async (dir: string): Promise<string | undefined> => {
  const exe = executableName()
  const directPath = path.join(dir, exe)
  if (await fileExists(directPath)) {
    return directPath
  }

  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subPath = path.join(dir, entry.name, exe)
      if (await fileExists(subPath)) {
        return subPath
      }
    }
  }
  return undefined
}

const installGolines = async (storageDirectory: string, version: string): Promise<string> =>
  coc.window.withProgress(
    { title: `Installing golines (${version})`, cancellable: true },
    async (progress, token) => {
      progress.report({ message: 'Resolving release...' })
      const release = await getRelease(version)
      if (token.isCancellationRequested) {
        throw new Error('Canceled')
      }
      const asset = selectAsset(release)

      await ensureDirectory(storageDirectory)
      const target = path.join(storageDirectory, executableName())

      const extractType = asset.name.endsWith('.zip') ? 'unzip' : 'untar'
      progress.report({ message: `Downloading ${asset.name}...` })
      await coc.download(
        asset.browser_download_url,
        {
          dest: storageDirectory,
          extract: extractType,
          strip: 1,
          timeout: DOWNLOAD_TIMEOUT,
          headers: { 'User-Agent': USER_AGENT },
          onProgress: percent =>
            progress.report({ message: `Downloading ${asset.name} (${percent}%)` }),
        },
        token,
      )

      if (token.isCancellationRequested) {
        throw new Error('Canceled')
      }

      let foundBinary = await locateBinary(storageDirectory)
      if (!foundBinary) {
        throw new Error(
          `The downloaded archive ${asset.name} does not contain ${executableName()}`,
        )
      }

      if (path.resolve(foundBinary) !== path.resolve(target)) {
        await fs.promises.copyFile(foundBinary, target)
        foundBinary = target
      }

      await fs.promises.chmod(foundBinary, 0o755).catch(() => undefined)

      progress.report({ message: 'Verifying...' })
      if (!(await getGolinesVersion(foundBinary))) {
        await fs.promises.rm(foundBinary, { force: true }).catch(() => undefined)
        throw new Error(`The downloaded binary (${release.tag_name}) could not be executed`)
      }
      return foundBinary
    },
  )

export const reinstallGolines = async (storageDirectory: string): Promise<string | undefined> => {
  try {
    const installed = await installGolines(storageDirectory, 'latest')
    coc.window.showInformationMessage(`golines installed at ${installed}`)
    return installed
  } catch (error) {
    if (errorMessage(error) !== 'Canceled') {
      coc.window.showErrorMessage(`Failed to install golines: ${errorMessage(error)}`)
    }
    return undefined
  }
}

const promptForUpdate = async (
  storageDirectory: string,
  release: GolinesRelease,
): Promise<void> => {
  const choice = await coc.window.showInformationMessage(
    `golines ${release.tag_name} is available to install.`,
    'Install',
    'Later',
  )
  if (choice === 'Install') {
    await reinstallGolines(storageDirectory)
  }
}

const checkForUpdate = async (storageDirectory: string, currentVersion: string): Promise<void> => {
  if (!getConfiguration().get<boolean>('checkUpdate', true)) {
    return
  }

  let release: GolinesRelease
  try {
    release = await getRelease('latest')
  } catch (error) {
    console.warn(`coc-golines: could not check for golines updates: ${errorMessage(error)}`)
    return
  }

  if (currentVersion !== release.tag_name.replace(/^v/, '')) {
    void promptForUpdate(storageDirectory, release)
  }
}

export const ensureGolinesExists = async (
  storageDirectory: string,
): Promise<string | undefined> => {
  const configured = getOptionalString('path')
  if (configured) {
    return configured
  }

  const installed = path.join(storageDirectory, executableName())
  if (await fileExists(installed)) {
    const version = await getGolinesVersion(installed)
    if (version) {
      void checkForUpdate(storageDirectory, version)
      return installed
    }
    coc.window.showWarningMessage(
      'The installed golines binary could not be executed, installing it again...',
    )
  }

  return reinstallGolines(storageDirectory)
}
