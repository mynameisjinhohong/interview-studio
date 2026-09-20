import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TtsVoice } from '../../shared/contracts.js'
import { runProcess } from './process-runner.js'

const ONECORE_PREFIX = 'onecore:'
const SAPI_PREFIX = 'sapi:'

export class TtsService {
  constructor(private root: string) { mkdirSync(join(root, 'cache', 'tts'), { recursive: true }) }

  async voices(): Promise<TtsVoice[]> {
    if (process.platform === 'darwin') {
      const result = await runProcess('/usr/bin/say', ['-v', '?'], { cwd: this.root, timeoutMs: 10_000 })
      return result.stdout.split('\n').flatMap((line) => {
        const match = line.match(/^(\S+)\s+([a-z]{2}_[A-Z]{2})/)
        return match && match[2].startsWith('ko') ? [{ id: match[1], name: match[1], language: match[2] }] : []
      })
    }
    if (process.platform === 'win32') {
      let oneCoreVoices: TtsVoice[] = []
      try {
        const oneCore = await import('@echogarden/windows-media-tts')
        if (oneCore.isAddonAvailable()) {
          oneCoreVoices = oneCore.getVoiceList().map((voice) => ({
            id: `${ONECORE_PREFIX}${voice.id}`,
            name: voice.displayName,
            language: voice.language
          }))
        }
      } catch { /* The legacy SAPI fallback below remains available. */ }
      if (oneCoreVoices.some((voice) => voice.language.toLowerCase().startsWith('ko'))) return oneCoreVoices
      const command = 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture.Name }'
      let result
      try { result = await runProcess('powershell.exe', ['-NoProfile', '-Command', command], { cwd: this.root, timeoutMs: 10_000 }) }
      catch { return oneCoreVoices }
      const sapiVoices = result.stdout.split('\n').filter(Boolean).map((line) => {
        const [name, language] = line.trim().split('|')
        return { id: `${SAPI_PREFIX}${name}`, name, language }
      })
      return [...oneCoreVoices, ...sapiVoices.filter((legacy) => !oneCoreVoices.some((modern) => modern.name === legacy.name && modern.language === legacy.language))]
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
      if (!voice || voice.startsWith(ONECORE_PREFIX)) {
        try {
          const oneCore = await import('@echogarden/windows-media-tts')
          if (oneCore.isAddonAvailable()) {
            const installed = oneCore.getVoiceList()
            const requested = voice.startsWith(ONECORE_PREFIX) ? voice.slice(ONECORE_PREFIX.length) : installed.find((item) => item.language.toLowerCase().startsWith('ko'))?.id
            const { audioData } = oneCore.synthesize(text, { voiceName: requested, speakingRate: rate, audioPitch: 1, enableSsml: false })
            writeFileSync(path, Buffer.from(audioData))
            return path
          }
        } catch (error) {
          if (voice.startsWith(ONECORE_PREFIX)) throw new Error(`Windows 최신 음성 생성에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const scriptPath = join(folder, 'render-tts.ps1')
      writeFileSync(scriptPath, `param([string]$Output,[string]$Voice,[int]$Rate,[string]$TextBase64)\nAdd-Type -AssemblyName System.Speech\n$s=New-Object System.Speech.Synthesis.SpeechSynthesizer\nif($Voice){$s.SelectVoice($Voice)}\n$s.Rate=$Rate\n$s.SetOutputToWaveFile($Output)\n$s.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64)))\n$s.Dispose()\n`)
      const sapiVoice = voice.startsWith(SAPI_PREFIX) ? voice.slice(SAPI_PREFIX.length) : voice
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Output', path, '-Voice', sapiVoice, '-Rate', String(Math.round((rate - 1) * 5)), '-TextBase64', Buffer.from(text).toString('base64')]
      const result = await runProcess('powershell.exe', args, { cwd: this.root, timeoutMs: 60_000 })
      if (result.exitCode !== 0) throw new Error('질문 음성 생성에 실패했습니다.')
      return path
    }
    throw new Error('현재 운영체제의 TTS를 지원하지 않습니다.')
  }
}
