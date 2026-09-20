import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildVoiceCatalog, TtsService } from '../src/main/services/tts-service.js'

describe('TTS voice catalog', () => {
  const roots: string[] = []
  afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

  it('keeps installed voices separate from downloadable neural candidates', () => {
    const catalog = buildVoiceCatalog([
      { id: 'onecore:heami', name: 'Microsoft Heami', language: 'ko-KR', engine: 'onecore' }
    ], false)

    expect(catalog.installed).toHaveLength(1)
    expect(catalog.packs[0]).toMatchObject({ id: 'supertonic-2', installed: false })
    expect(catalog.packs[0].voices).toHaveLength(10)
    expect(catalog.packs[0].voices.every((voice) => voice.id.startsWith('supertonic-2:'))).toBe(true)
  })

  it('exposes all ten neural voices as installed after the pack is ready', () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-studio-tts-catalog-'))
    roots.push(root)
    const catalog = buildVoiceCatalog([], true)

    expect(catalog.installed).toHaveLength(10)
    expect(catalog.packs[0].installed).toBe(true)
    expect(new TtsService(root).voicePackStatus('supertonic-2').installed).toBe(false)
  })

  it('rejects unknown voice packs before performing network work', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-studio-tts-catalog-'))
    roots.push(root)
    await expect(new TtsService(root).installVoicePack('unknown-pack')).rejects.toThrow('지원하지 않는 음성 팩')
  })
})
