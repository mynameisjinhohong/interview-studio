import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database.js'
import { CliRegistry } from '../src/main/services/cli-adapters.js'
import { DiagnosticLogger } from '../src/main/services/logger.js'
import { ProfileService } from '../src/main/services/profile-service.js'

describe('live profile context (manual)', () => {
  const liveProfileUrl = process.env.LIVE_PROFILE_URL
  it.skipIf(process.env.LIVE_PROFILE_CONTEXT !== '1' || !liveProfileUrl)('summarizes an explicitly supplied portfolio through the installed Codex CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-live-profile-'))
    const db = new AppDatabase(root)
    const cli = new CliRegistry(join(root, 'runtime'), new DiagnosticLogger(root))
    const profile = await new ProfileService(db, cli).create({
      name: '테스트 지원자', targetRole: '소프트웨어 개발자', experienceLevel: '1~3년',
      filePaths: [], urls: [liveProfileUrl!], provider: 'codex'
    })

    expect(profile.sources[0].extractedText.length).toBeGreaterThan(500)
    expect(profile.contextMarkdown.length).toBeGreaterThan(200)
    expect(profile.completeness).toBeGreaterThan(0)
  }, 300_000)
})
