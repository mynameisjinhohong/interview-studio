import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runProcess } from './process-runner.js'

export class TtsService {
  constructor(private root: string) { mkdirSync(join(root, 'cache', 'tts'), { recursive: true }) }

  async voices(): Promise<Array<{ id: string; name: string; language: string }>> {
    if (process.platform === 'darwin') {
      const result = await runProcess('/usr/bin/say', ['-v', '?'], { cwd: this.root, timeoutMs: 10_000 })
      return result.stdout.split('\n').flatMap((line) => {
        const match = line.match(/^(\S+)\s+([a-z]{2}_[A-Z]{2})/)
        return match && match[2].startsWith('ko') ? [{ id: match[1], name: match[1], language: match[2] }] : []
      })
    }
    if (process.platform === 'win32') {
      const command = 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture.Name }'
      const result = await runProcess('powershell.exe', ['-NoProfile', '-Command', command], { cwd: this.root, timeoutMs: 10_000 })
      return result.stdout.split('\n').filter(Boolean).map((line) => { const [name, language] = line.trim().split('|'); return { id: name, name, language } })
    }
    return []
  }

  async render(text: string, voice = '', rate = 1): Promise<string> {
    const folder = join(this.root, 'cache', 'tts')
    const id = crypto.randomUUID()
    if (process.platform === 'darwin') {
      const path = join(folder, `${id}.aiff`)
      const args = [...(voice ? ['-v', voice] : []), '-r', String(Math.round(180 * rate)), '-o', path, text]
      const result = await runProcess('/usr/bin/say', args, { cwd: this.root, timeoutMs: 60_000 })
      if (result.exitCode !== 0) throw new Error('질문 음성 생성에 실패했습니다.')
      return path
    }
    if (process.platform === 'win32') {
      const path = join(folder, `${id}.wav`)
      const scriptPath = join(folder, 'render-tts.ps1')
      writeFileSync(scriptPath, `param([string]$Output,[string]$Voice,[int]$Rate,[string]$TextBase64)\nAdd-Type -AssemblyName System.Speech\n$s=New-Object System.Speech.Synthesis.SpeechSynthesizer\nif($Voice){$s.SelectVoice($Voice)}\n$s.Rate=$Rate\n$s.SetOutputToWaveFile($Output)\n$s.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64)))\n$s.Dispose()\n`)
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Output', path, '-Voice', voice, '-Rate', String(Math.round((rate - 1) * 5)), '-TextBase64', Buffer.from(text).toString('base64')]
      const result = await runProcess('powershell.exe', args, { cwd: this.root, timeoutMs: 60_000 })
      if (result.exitCode !== 0) throw new Error('질문 음성 생성에 실패했습니다.')
      return path
    }
    throw new Error('현재 운영체제의 TTS를 지원하지 않습니다.')
  }
}
