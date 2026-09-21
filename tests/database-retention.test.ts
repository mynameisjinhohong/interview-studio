import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { AppDatabase } from '../src/main/database.js'
import type { FinalReport, SessionConfig } from '../src/shared/contracts.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const config: SessionConfig = {
  profileId: 'profile', type: 'technical', mode: 'practice', provider: 'codex', questionCount: 5,
  stacks: ['C#'], experienceLevel: '신입', focusAreas: [], excludedAreas: [], company: '', role: '', stage: '', jobPostText: '', jobPostUrl: '', forceResearch: false
}
const report: FinalReport = {
  totalScore: 60, summary: '', strengths: [], improvements: [], topics: [{ topic: 'C#', score: 60,
    breakdown: { relevance: 15, evidence: 15, depth: 15, structure: 10, concision: 5 }, strengths: [], improvements: [], improvedAnswer: '' }]
}

describe('session retention', () => {
  it('migrates a 0.1 profile database and preserves the existing context', () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-studio-migration-')); roots.push(root)
    const path = join(root, 'interview-studio.sqlite')
    const legacy = new Database(path)
    legacy.exec(`CREATE TABLE profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, target_role TEXT NOT NULL, experience_level TEXT NOT NULL,
      context_markdown TEXT NOT NULL, completeness INTEGER NOT NULL, missing_sections_json TEXT NOT NULL,
      sources_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    const timestamp = new Date().toISOString()
    legacy.prepare('INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      'legacy-profile', '김개발', '게임 클라이언트 개발자', '1~3년', '# 기존 컨텍스트', 80, '[]', '[]', timestamp, timestamp
    )
    legacy.close()

    const db = new AppDatabase(root)
    expect(db.getProfile('legacy-profile')).toMatchObject({ contextMarkdown: '# 기존 컨텍스트', followUpQuestions: [] })
    expect(db.getSettings()).toMatchObject({ cliVerified: false })
    expect(db.saveSettings({ cliVerified: true })).toMatchObject({ cliVerified: true })
    db.close()
  })

  it('keeps ten full sessions and anonymizes the deleted completed score', () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-studio-test-')); roots.push(root)
    const db = new AppDatabase(root)
    for (let index = 0; index < 10; index += 1) {
      const session = db.createSession(config)
      db.updateSession(session.id, { title: `회사-${index}`, status: 'completed', report, completedAt: new Date().toISOString() })
    }
    expect(db.retentionCandidate()).not.toBeNull()
    expect(db.enforceRetention()).not.toBeNull()
    db.createSession(config)
    const dashboard = db.dashboard()
    expect(dashboard.sessions).toHaveLength(10)
    expect(dashboard.aggregate).toContainEqual({ topic: 'C#', averageScore: 60, attempts: 10 })
    db.close()
  })
})
