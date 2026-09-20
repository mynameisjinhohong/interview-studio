import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TtsService } from '../src/main/services/tts-service.js'

describe.runIf(process.env.INTERVIEW_TTS_INTEGRATION === '1')('Supertonic voice pack integration', () => {
  let root = ''

  beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'interview-studio-supertonic-')) })
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) })

  it('downloads the pack and renders Korean speech locally', async () => {
    const service = new TtsService(root)
    const catalog = await service.installVoicePack('supertonic-2')
    const voice = catalog.installed.find((item) => item.id === 'supertonic-2:F1')
    expect(voice).toBeDefined()

    const restartedService = new TtsService(root)
    const output = await restartedService.render('안녕하세요. 면접을 시작하겠습니다.', voice!.id, 0.9)
    expect(statSync(output).size).toBeGreaterThan(44)
  }, 300_000)
})
