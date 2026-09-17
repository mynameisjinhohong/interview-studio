import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
