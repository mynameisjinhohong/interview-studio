import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, renameSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { homedir } from 'node:os'
import { DiagnosticLogger } from './logger.js'
import { runProcess } from './process-runner.js'

const ffmpegStatic = createRequire(import.meta.url)('ffmpeg-static') as string | null

const MODEL_URLS = {
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
} as const

const findWhisper = (root: string): string | null => {
  const candidates = process.platform === 'win32' ? ['whisper-cli.exe', 'whisper.exe'] : ['whisper-cli', 'whisper']
  const home = homedir()
  const common = process.platform === 'win32'
    ? [join(root, 'runtime', 'bin'), join(process.resourcesPath, 'sidecar'), join(process.env.LOCALAPPDATA ?? '', 'whisper.cpp')]
    : [join(root, 'runtime', 'bin'), join(process.resourcesPath, 'sidecar'), '/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin')]
  for (const name of candidates) {
    for (const dir of [...new Set([...(process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':'), ...common])].filter(Boolean)) {
      const path = join(dir, name)
      if (existsSync(path)) return path
    }
  }
  return null
}

export class SttService {
  constructor(private root: string, private logger: DiagnosticLogger) {}
  private modelPath(model: keyof typeof MODEL_URLS): string { return join(this.root, 'models', `ggml-${model}.bin`) }
  status(): { binary: string | null; models: Record<string, boolean> } {
    return { binary: findWhisper(this.root), models: Object.fromEntries(Object.keys(MODEL_URLS).map((key) => [key, existsSync(this.modelPath(key as keyof typeof MODEL_URLS))])) }
  }

  async download(model: keyof typeof MODEL_URLS): Promise<{ path: string; sha256: string }> {
    const path = this.modelPath(model)
    const partial = `${path}.partial`
    const response = await fetch(MODEL_URLS[model], { redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`STT 모델 다운로드 실패: HTTP ${response.status}`)
    const output = createWriteStream(partial)
    await new Promise<void>((resolve, reject) => {
      Readable.fromWeb(response.body as any).pipe(output).on('finish', resolve).on('error', reject)
    })
    if (statSync(partial).size < 1_000_000) throw new Error('다운로드한 모델 파일이 비정상적으로 작습니다.')
    const digest = await new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256')
      const input = createReadStream(partial)
      input.on('data', (chunk) => hash.update(chunk))
      input.on('end', () => resolve(hash.digest('hex')))
      input.on('error', reject)
    })
    const etag = (response.headers.get('etag') ?? '').replace(/["']/g, '').replace(/^W\//, '')
    if (/^[a-f0-9]{64}$/i.test(etag) && etag.toLowerCase() !== digest) {
      rmSync(partial, { force: true }); throw new Error('STT 모델 무결성 검증에 실패했습니다.')
    }
    renameSync(partial, path)
    return { path, sha256: digest }
  }

  async transcribe(audioPath: string, model: 'base' | 'small' | 'medium'): Promise<string> {
    const whisper = findWhisper(this.root)
    const modelPath = this.modelPath(model)
    if (!whisper) throw new Error('whisper-cli 실행 파일을 찾을 수 없습니다. README의 설치 안내를 확인하세요.')
    if (!existsSync(modelPath)) throw new Error(`${model} STT 모델을 먼저 다운로드하세요.`)
    if (!ffmpegStatic) throw new Error('FFmpeg 실행 파일을 찾을 수 없습니다.')
    const wavPath = `${audioPath}.wav`
    await runProcess(ffmpegStatic, ['-y', '-i', audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath], { cwd: this.root, timeoutMs: 60_000 })
    let lastError: unknown
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const result = await runProcess(whisper, ['-m', modelPath, '-f', wavPath, '-l', 'ko', '-nt'], { cwd: this.root, timeoutMs: 300_000 })
        this.logger.write('stt.transcribe', { attempt, exitCode: result.exitCode, durationMs: result.durationMs })
        if (result.exitCode !== 0) throw new Error(result.stderr.slice(0, 240))
        return result.stdout.replace(/^\s*\[[^\]]+\]\s*/gm, '').trim()
      } catch (error) { lastError = error }
    }
    throw lastError instanceof Error ? lastError : new Error('음성 전사에 실패했습니다.')
  }
}
