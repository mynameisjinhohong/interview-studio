import { spawn } from 'node:child_process'
import { delimiter } from 'node:path'

export interface ProcessResult { stdout: string; stderr: string; exitCode: number; durationMs: number }

export class ProcessCancelledError extends Error {
  constructor() {
    super('사용자가 작업을 취소했습니다.')
    this.name = 'ProcessCancelledError'
  }
}

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
  options: {
    cwd: string
    input?: string | Uint8Array
    timeoutMs?: number | null
    idleTimeoutMs?: number | null
    signal?: AbortSignal
    env?: NodeJS.ProcessEnv
    pathEntries?: string[]
  }
): Promise<ProcessResult> => new Promise((resolve, reject) => {
  if (options.signal?.aborted) { reject(new ProcessCancelledError()); return }
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
  let overallTimeout: ReturnType<typeof setTimeout> | undefined
  let idleTimeout: ReturnType<typeof setTimeout> | undefined
  const clearTimers = (): void => {
    if (overallTimeout) clearTimeout(overallTimeout)
    if (idleTimeout) clearTimeout(idleTimeout)
    options.signal?.removeEventListener('abort', abortProcess)
  }
  const terminate = (error: Error): void => {
    if (settled) return
    settled = true
    clearTimers()
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.once('error', () => child.kill())
      killer.unref()
    } else child.kill('SIGKILL')
    reject(error)
  }
  function abortProcess(): void { terminate(new ProcessCancelledError()) }
  if (options.timeoutMs !== null) {
    const overallMs = options.timeoutMs ?? 60_000
    overallTimeout = setTimeout(() => terminate(new Error(`프로세스가 ${overallMs}ms 전체 제한 안에 끝나지 않았습니다.`)), overallMs)
  }
  const refreshIdleTimeout = (): void => {
    if (!options.idleTimeoutMs) return
    if (idleTimeout) clearTimeout(idleTimeout)
    idleTimeout = setTimeout(
      () => terminate(new Error(`프로세스가 ${options.idleTimeoutMs}ms 동안 응답하지 않았습니다.`)),
      options.idleTimeoutMs
    )
  }
  refreshIdleTimeout()
  options.signal?.addEventListener('abort', abortProcess, { once: true })
  if (options.signal?.aborted) { abortProcess(); return }
  child.stdout.on('data', (chunk) => { stdout.push(Buffer.from(chunk)); refreshIdleTimeout() })
  child.stderr.on('data', (chunk) => { stderr.push(Buffer.from(chunk)); refreshIdleTimeout() })
  child.on('error', (error) => {
    if (settled) return
    settled = true
    clearTimers()
    reject(error)
  })
  child.on('close', (code) => {
    if (settled) return
    settled = true
    clearTimers()
    resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), exitCode: code ?? -1, durationMs: Date.now() - started })
  })
  if (options.input) child.stdin.end(options.input)
  else child.stdin.end()
})
