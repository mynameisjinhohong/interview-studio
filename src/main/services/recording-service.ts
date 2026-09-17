import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runProcess } from './process-runner.js'

const ffmpegStatic = createRequire(import.meta.url)('ffmpeg-static') as string | null

export class RecordingService {
  constructor(private root: string) {}
  private folder(sessionId: string): string {
    const folder = join(this.root, 'sessions', sessionId, 'recording')
    mkdirSync(folder, { recursive: true })
    return folder
  }
  append(sessionId: string, sequence: number, bytes: Uint8Array): void {
    const path = join(this.folder(sessionId), `${String(sequence).padStart(8, '0')}.chunk`)
    writeFileSync(path, Buffer.from(bytes))
  }
  async finalize(sessionId: string): Promise<string | null> {
    const folder = this.folder(sessionId)
    const chunks = readdirSync(folder).filter((name) => name.endsWith('.chunk')).sort()
    if (!chunks.length) return null
    const outputPath = join(folder, 'interview.webm')
    const output = createWriteStream(outputPath)
    for (const chunk of chunks) {
      await new Promise<void>((resolve, reject) => {
        const input = createReadStream(join(folder, chunk))
        input.on('end', resolve)
        input.on('error', reject)
        output.on('error', reject)
        input.pipe(output, { end: false })
      })
    }
    output.end()
    await new Promise<void>((resolve) => output.on('finish', resolve))
    chunks.forEach((chunk) => rmSync(join(folder, chunk), { force: true }))
    return outputPath
  }
  async exportMp4(inputPath: string, outputPath: string): Promise<void> {
    if (!existsSync(inputPath) || !ffmpegStatic) throw new Error('변환할 영상 또는 FFmpeg를 찾을 수 없습니다.')
    const encoder = process.platform === 'darwin' ? 'h264_videotoolbox' : process.platform === 'win32' ? 'h264_mf' : 'mpeg4'
    let result = await runProcess(ffmpegStatic, ['-y', '-i', inputPath, '-c:v', encoder, '-c:a', 'aac', '-movflags', '+faststart', outputPath], { cwd: this.root, timeoutMs: 600_000 })
    if (result.exitCode !== 0) result = await runProcess(ffmpegStatic, ['-y', '-i', inputPath, '-c:v', 'mpeg4', '-c:a', 'aac', outputPath], { cwd: this.root, timeoutMs: 600_000 })
    if (result.exitCode !== 0) throw new Error('MP4 변환에 실패했습니다.')
  }
}
