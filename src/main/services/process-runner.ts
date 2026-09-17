import { spawn } from 'node:child_process'
import { delimiter } from 'node:path'

export interface ProcessResult { stdout: string; stderr: string; exitCode: number; durationMs: number }

const SAFE_ENV_KEYS = [
  'PATH', 'HOME', 'USER', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR',
  'LANG', 'LC_ALL', 'SHELL', 'TERM', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'GEMINI_CLI_HOME'
]

export const safeEnvironment = (): NodeJS.ProcessEnv => Object.fromEntries(
  SAFE_ENV_KEYS.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : [])
)

export const runProcess = (
  command: string,
  args: string[],
  options: { cwd: string; input?: string | Uint8Array; timeoutMs?: number; idleTimeoutMs?: number; env?: NodeJS.ProcessEnv; pathEntries?: string[] }
): Promise<ProcessResult> => new Promise((resolve, reject) => {
  const started = Date.now()
  const childEnvironment = { ...safeEnvironment(), ...options.env }
  if (options.pathEntries?.length) {
    childEnvironment.PATH = [...new Set([
      ...options.pathEntries.filter(Boolean),
      ...(childEnvironment.PATH ?? '').split(delimiter).filter(Boolean)
    ])].join(delimiter)
  }
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: childEnvironment,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  let settled = false
  let timeoutError: Error | undefined
  let idleTimeout: ReturnType<typeof setTimeout> | undefined
  const clearTimers = (): void => {
    clearTimeout(overallTimeout)
    if (idleTimeout) clearTimeout(idleTimeout)
  }
  const rejectForTimeout = (message: string): void => {
    if (settled || timeoutError) return
    timeoutError = new Error(message)
    clearTimers()
    const killed = child.kill(process.platform === 'win32' ? undefined : 'SIGKILL')
    if (!killed) {
      settled = true
      reject(timeoutError)
    }
  }
  const overallMs = options.timeoutMs ?? 60_000
  const overallTimeout = setTimeout(() => rejectForTimeout(`프로세스가 ${overallMs}ms 전체 제한 안에 끝나지 않았습니다.`), overallMs)
  const refreshIdleTimeout = (): void => {
    if (!options.idleTimeoutMs) return
    if (idleTimeout) clearTimeout(idleTimeout)
    idleTimeout = setTimeout(
      () => rejectForTimeout(`프로세스가 ${options.idleTimeoutMs}ms 동안 응답하지 않았습니다.`),
      options.idleTimeoutMs
    )
  }
  refreshIdleTimeout()
  child.stdout.on('data', (chunk) => { stdout.push(Buffer.from(chunk)); refreshIdleTimeout() })
  child.stderr.on('data', (chunk) => { stderr.push(Buffer.from(chunk)); refreshIdleTimeout() })
  child.on('error', (error) => {
    if (settled) return
    settled = true
    clearTimers()
    reject(timeoutError ?? error)
  })
  child.on('close', (code) => {
    if (settled) return
    settled = true
    clearTimers()
    if (timeoutError) {
      reject(timeoutError)
      return
    }
    resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode: code ?? -1, durationMs: Date.now() - started })
  })
  if (options.input) child.stdin.end(options.input)
  else child.stdin.end()
})
