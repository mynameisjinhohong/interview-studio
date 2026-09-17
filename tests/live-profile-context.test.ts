import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppDatabase } from '../src/main/database.js'
import { CliRegistry } from '../src/main/services/cli-adapters.js'
import { DiagnosticLogger } from '../src/main/services/logger.js'
import { ProfileService } from '../src/main/services/profile-service.js'

describe('live profile context (manual)', () => {
  it.skipIf(process.env.LIVE_PROFILE_CONTEXT !== '1')('summarizes hongjinho.dev through the installed Codex CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-live-profile-'))
    const db = new AppDatabase(root)
    const cli = new CliRegistry(join(root, 'runtime'), new DiagnosticLogger(root))
    const profile = await new ProfileService(db, cli).create({
      name: '홍진호', targetRole: '게임 클라이언트 개발자', experienceLevel: '1~3년',
      filePaths: [], urls: ['https://hongjinho.dev/'], provider: 'codex'
    })

    expect(profile.sources[0].extractedText.length).toBeGreaterThan(7_000)
    expect(profile.contextMarkdown).toContain('Unity')
    expect(profile.contextMarkdown).toContain('강한 토끼만이 살아남는다')
    expect(profile.contextMarkdown).toMatch(/Jenkins|CI\/CD/)
    expect(profile.completeness).toBeGreaterThanOrEqual(60)
  }, 300_000)
})
