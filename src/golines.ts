import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'

export const runCommand = (
  command: string,
  args: string[],
  stdinText?: string,
  cwd?: string,
): Promise<{ stdout: string, stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

    child.on('error', (error) => {
      reject(new Error(`Failed to run ${command}: ${error.message}`))
    })

    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8')
      const err = Buffer.concat(stderr).toString('utf8')
      if (code === 0) {
        resolve({ stdout: out, stderr: err })
        return
      }
      reject(new Error(`${command} exited with code ${code}${err ? `: ${err.trim()}` : ''}`))
    })

    child.stdin.on('error', () => undefined)
    if (stdinText !== undefined) {
      child.stdin.write(stdinText)
    }
    child.stdin.end()
  })

export const getGolinesVersion = async (command: string): Promise<string | undefined> => {
  try {
    const { stdout } = await runCommand(command, ['--version'])
    return stdout.match(/(\d+\.\d+\.\d[\w.+-]*)/)?.[1]
  } catch {
    return undefined
  }
}
