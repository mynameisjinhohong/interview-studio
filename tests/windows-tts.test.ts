import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TtsService } from '../src/main/services/tts-service.js'

describe.skipIf(process.platform !== 'win32')('Windows OneCore TTS', () => {
  let root = ''

  beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'interview-studio-tts-')) })
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }) })

  it('lists a modern Windows voice and renders a playable wave file', async () => {
    const service = new TtsService(root)
    const voices = await service.voices()
    const modernVoice = voices.find((voice) => voice.id.startsWith('onecore:'))

    expect(modernVoice).toBeDefined()
    const output = await service.render('Interview Studio voice check.', modernVoice!.id, 0.9)
    expect(statSync(output).size).toBeGreaterThan(44)
  })
})
