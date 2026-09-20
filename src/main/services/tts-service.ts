import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TtsVoice, TtsVoiceCatalog, TtsVoicePack } from '../../shared/contracts.js'
import { runProcess } from './process-runner.js'

const ONECORE_PREFIX = 'onecore:'
const SAPI_PREFIX = 'sapi:'
const SUPERTONIC_PACK_ID = 'supertonic-2'
const SUPERTONIC_PREFIX = `${SUPERTONIC_PACK_ID}:`
const SUPERTONIC_MODEL = 'onnx-community/Supertonic-TTS-2-ONNX'
const SUPERTONIC_VOICE_IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'] as const

type NeuralAudio = { save(path: string): Promise<void> }
type NeuralSynthesizer = (text: string, options: {
  speaker_embeddings: Float32Array
  num_inference_steps: number
  speed: number
}) => Promise<NeuralAudio>

const supertonicVoices = (): TtsVoice[] => SUPERTONIC_VOICE_IDS.map((id, index) => ({
  id: `${SUPERTONIC_PREFIX}${id}`,
  name: `Supertonic ${id.startsWith('F') ? '여성' : '남성'} ${index % 5 + 1}`,
  language: 'ko-KR',
  engine: 'supertonic',
  gender: id.startsWith('F') ? 'female' : 'male'
}))

const supertonicPack = (installed: boolean): TtsVoicePack => ({
  id: SUPERTONIC_PACK_ID,
  name: 'Supertonic 2 한국어 고품질 음성',
  description: '기기 안에서 동작하는 AI 음성 10종(여성 5·남성 5)입니다. 설치 후 인터넷 없이 사용할 수 있습니다.',
  downloadSizeMb: 263,
  license: 'OpenRAIL-M',
  installed,
  voices: supertonicVoices()
})

export const buildVoiceCatalog = (systemVoices: TtsVoice[], supertonicInstalled: boolean): TtsVoiceCatalog => ({
  installed: [...systemVoices, ...(supertonicInstalled ? supertonicVoices() : [])],
  packs: [supertonicPack(supertonicInstalled)]
})

export class TtsService {
  private readonly ttsCache: string
  private readonly packRoot: string
  private readonly modelCache: string
  private neuralPipeline: Promise<NeuralSynthesizer> | null = null

  constructor(private root: string) {
    this.ttsCache = join(root, 'cache', 'tts')
    this.packRoot = join(root, 'models', 'tts', SUPERTONIC_PACK_ID)
    this.modelCache = join(this.packRoot, 'transformers-cache')
    mkdirSync(this.ttsCache, { recursive: true })
  }

  voicePackStatus(packId: string): TtsVoicePack {
    if (packId !== SUPERTONIC_PACK_ID) throw new Error(`지원하지 않는 음성 팩입니다: ${packId}`)
    return supertonicPack(existsSync(join(this.packRoot, 'installed.json')))
  }

  private async systemVoices(): Promise<TtsVoice[]> {
    if (process.platform === 'darwin') {
      const result = await runProcess('/usr/bin/say', ['-v', '?'], { cwd: this.root, timeoutMs: 10_000 })
      return result.stdout.split('\n').flatMap((line) => {
        const match = line.match(/^(\S+)\s+([a-z]{2}_[A-Z]{2})/)
        return match && match[2].startsWith('ko') ? [{ id: match[1], name: match[1], language: match[2], engine: 'macos' as const }] : []
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
            language: voice.language,
            engine: 'onecore'
          }))
        }
      } catch { /* The legacy SAPI fallback below remains available. */ }
      const command = 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture.Name }'
      let result
      try { result = await runProcess('powershell.exe', ['-NoProfile', '-Command', command], { cwd: this.root, timeoutMs: 10_000 }) }
      catch { return oneCoreVoices }
      const sapiVoices: TtsVoice[] = result.stdout.split('\n').filter(Boolean).map((line) => {
        const [name, language] = line.trim().split('|')
        return { id: `${SAPI_PREFIX}${name}`, name, language, engine: 'sapi' }
      })
      return [...oneCoreVoices, ...sapiVoices.filter((legacy) => !oneCoreVoices.some((modern) => modern.name === legacy.name && modern.language === legacy.language))]
    }
    return []
  }

  async catalog(): Promise<TtsVoiceCatalog> {
    return buildVoiceCatalog(await this.systemVoices(), this.voicePackStatus(SUPERTONIC_PACK_ID).installed)
  }

  async voices(): Promise<TtsVoice[]> {
    return (await this.catalog()).installed
  }

  private async loadNeuralPipeline(localFilesOnly: boolean): Promise<NeuralSynthesizer> {
    if (!this.neuralPipeline) {
      this.neuralPipeline = (async () => {
        const { pipeline } = await import('@huggingface/transformers')
        const synthesizer = await pipeline('text-to-speech', SUPERTONIC_MODEL, {
          cache_dir: this.modelCache,
          local_files_only: localFilesOnly,
          device: 'cpu'
        })
        return synthesizer as unknown as NeuralSynthesizer
      })().catch((error) => {
        this.neuralPipeline = null
        throw error
      })
    }
    return this.neuralPipeline
  }

  async installVoicePack(packId: string): Promise<TtsVoiceCatalog> {
    this.voicePackStatus(packId)
    mkdirSync(join(this.packRoot, 'voices'), { recursive: true })
    mkdirSync(this.modelCache, { recursive: true })
    await Promise.all(SUPERTONIC_VOICE_IDS.map(async (voiceId) => {
      const destination = join(this.packRoot, 'voices', `${voiceId}.bin`)
      if (existsSync(destination)) return
      const response = await fetch(`https://huggingface.co/${SUPERTONIC_MODEL}/resolve/main/voices/${voiceId}.bin`)
      if (!response.ok) throw new Error(`음성 ${voiceId} 다운로드에 실패했습니다. (${response.status})`)
      const temporary = `${destination}.download`
      writeFileSync(temporary, Buffer.from(await response.arrayBuffer()))
      renameSync(temporary, destination)
    }))
    await this.loadNeuralPipeline(false)
    writeFileSync(join(this.packRoot, 'installed.json'), JSON.stringify({ model: SUPERTONIC_MODEL, installedAt: new Date().toISOString() }))
    return this.catalog()
  }

  private async renderSupertonic(text: string, voice: string, rate: number, path: string): Promise<string> {
    if (!this.voicePackStatus(SUPERTONIC_PACK_ID).installed) throw new Error('Supertonic 2 음성 팩을 먼저 다운로드하세요.')
    const voiceId = voice.slice(SUPERTONIC_PREFIX.length)
    if (!SUPERTONIC_VOICE_IDS.includes(voiceId as typeof SUPERTONIC_VOICE_IDS[number])) throw new Error('선택한 Supertonic 음성을 찾을 수 없습니다.')
    const bytes = readFileSync(join(this.packRoot, 'voices', `${voiceId}.bin`))
    const embeddings = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Float32Array.BYTES_PER_ELEMENT)
    const synthesizer = await this.loadNeuralPipeline(true)
    const audio = await synthesizer(`<ko>${text}</ko>`, {
      speaker_embeddings: embeddings,
      num_inference_steps: 5,
      speed: rate
    })
    await audio.save(path)
    return path
  }

  async render(text: string, voice = '', rate = 1): Promise<string> {
    const id = crypto.randomUUID()
    if (voice.startsWith(SUPERTONIC_PREFIX)) return this.renderSupertonic(text, voice, rate, join(this.ttsCache, `${id}.wav`))
    if (process.platform === 'darwin') {
      const path = join(this.ttsCache, `${id}.aiff`)
      const args = [...(voice ? ['-v', voice] : []), '-r', String(Math.round(180 * rate)), '-o', path, text]
      const result = await runProcess('/usr/bin/say', args, { cwd: this.root, timeoutMs: 60_000 })
      if (result.exitCode !== 0) throw new Error('질문 음성 생성에 실패했습니다.')
      return path
    }
    if (process.platform === 'win32') {
      const path = join(this.ttsCache, `${id}.wav`)
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
      const scriptPath = join(this.ttsCache, 'render-tts.ps1')
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
