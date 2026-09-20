import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DiagnosticLogger } from '../src/main/services/logger.js'
import { SttService } from '../src/main/services/stt-service.js'

describe.runIf(process.env.INTERVIEW_STT_DOWNLOAD_INTEGRATION === '1')('STT model download integration', () => {
  let root = ''
  beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'interview-studio-stt-download-')) })
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) })

  it('downloads and verifies the current official small model', async () => {
    const result = await new SttService(root, new DiagnosticLogger(root)).download('small')
    expect(statSync(result.path).size).toBe(487_601_967)
    expect(result.sha256).toBe('1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b')
  }, 300_000)
})
