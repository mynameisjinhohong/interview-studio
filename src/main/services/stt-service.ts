import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { homedir } from 'node:os'
import type { SttModel, SttStatus } from '../../shared/contracts.js'
import { DiagnosticLogger } from './logger.js'
import { runProcess } from './process-runner.js'

const ffmpegStatic = createRequire(import.meta.url)('ffmpeg-static') as string | null

const MODEL_MANIFEST = {
  base: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    size: 147_951_465,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
  },
  small: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    size: 487_601_967,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'
  },
  medium: {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    size: 1_533_763_059,
    sha256: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208'
  }
} as const

export const validateSttModelArtifact = (
  model: keyof typeof MODEL_MANIFEST,
  actualSize: number,
  actualSha256: string,
  _responseEtag = ''
): void => {
  const expected = MODEL_MANIFEST[model]
  if (actualSize !== expected.size) throw new Error('STT 모델 무결성 검증 실패: 파일 크기가 일치하지 않습니다.')
  if (actualSha256.toLowerCase() !== expected.sha256) throw new Error('STT 모델 무결성 검증 실패: SHA-256이 일치하지 않습니다.')
}

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
  constructor(private root: string, private logger: DiagnosticLogger) {
    mkdirSync(join(root, 'models'), { recursive: true })
  }
  private modelPath(model: keyof typeof MODEL_MANIFEST): string { return join(this.root, 'models', `ggml-${model}.bin`) }
  status(): SttStatus {
    return {
      binary: findWhisper(this.root),
      models: Object.fromEntries(Object.keys(MODEL_MANIFEST).map((key) => [key, existsSync(this.modelPath(key as SttModel))])) as Record<SttModel, boolean>
    }
  }

  async download(model: keyof typeof MODEL_MANIFEST): Promise<{ path: string; sha256: string }> {
    const path = this.modelPath(model)
    const partial = `${path}.partial`
    try {
      const response = await fetch(MODEL_MANIFEST[model].url, { redirect: 'follow' })
      if (!response.ok || !response.body) throw new Error(`STT 모델 다운로드 실패: HTTP ${response.status}`)
      await pipeline(Readable.fromWeb(response.body as any), createWriteStream(partial))
      const digest = await new Promise<string>((resolve, reject) => {
        const hash = createHash('sha256')
        const input = createReadStream(partial)
        input.on('data', (chunk) => hash.update(chunk))
        input.on('end', () => resolve(hash.digest('hex')))
        input.on('error', reject)
      })
      validateSttModelArtifact(model, statSync(partial).size, digest, response.headers.get('etag') ?? '')
      renameSync(partial, path)
      return { path, sha256: digest }
    } catch (error) {
      rmSync(partial, { force: true })
      throw error
    }
  }

  async transcribe(audioPath: string, model: SttModel): Promise<string> {
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
