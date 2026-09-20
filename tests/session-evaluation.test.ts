import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppDatabase } from '../src/main/database.js'
import { InterviewService } from '../src/main/services/interview-service.js'
import type { FinalReport, SessionConfig } from '../src/shared/contracts.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const config: SessionConfig = {
  profileId: 'profile', type: 'technical', mode: 'practice', provider: 'codex', questionCount: 3,
  stacks: ['C#'], experienceLevel: '신입', focusAreas: [], excludedAreas: [], company: '', role: '', stage: '',
  questionFocus: 'auto', jobPostText: '', jobPostUrl: '', forceResearch: false
}

const report: FinalReport = {
  totalScore: 0, summary: '평가', strengths: [], improvements: [], topics: [1, 2, 3].map((index) => ({
    topic: `주제 ${index}`, score: 0,
    breakdown: { relevance: 0, evidence: 0, depth: 0, structure: 0, concision: 0 },
    strengths: [], improvements: ['무응답'], improvedAnswer: ''
  }))
}

const preparedSession = (db: AppDatabase) => {
  const session = db.createSession(config)
  return db.updateSession(session.id, {
    status: 'analyzing', questionPlan: {
      title: 'C#', questions: [1, 2, 3].map((index) => ({
        id: `q-${index}`, category: index < 3 ? 'cs' : 'portfolio', topic: `주제 ${index}`, question: `질문 ${index}`, intent: '', sourceUrls: [], suggestedFollowUps: []
      }))
    }
  })
}

describe('final evaluation execution policy', () => {
  it('runs without fixed overall or idle timeouts and receives a cancellation signal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-evaluation-')); roots.push(root)
    const db = new AppDatabase(root)
    const session = preparedSession(db)
    const invokeStructured = vi.fn().mockResolvedValue(report)
    const service = new InterviewService(db, { get: vi.fn(() => ({ invokeStructured })) } as never, {} as never, {} as never)

    await service.finish(session.id, undefined, 'evaluation-request')

    expect(invokeStructured.mock.calls[0]?.[4]).toMatchObject({ timeoutMs: null, idleTimeoutMs: null, signal: expect.any(AbortSignal) })
    db.close()
  })

  it('cancels an active evaluation and preserves a partial result', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-evaluation-cancel-')); roots.push(root)
    const db = new AppDatabase(root)
    const session = preparedSession(db)
    const invokeStructured = vi.fn((_task, _input, _schema, _validator, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const service = new InterviewService(db, { get: vi.fn(() => ({ invokeStructured })) } as never, {} as never, {} as never)

    const pending = service.finish(session.id, undefined, 'evaluation-to-cancel')
    await vi.waitFor(() => expect(invokeStructured).toHaveBeenCalledOnce())
    expect(service.cancelEvaluation('evaluation-to-cancel')).toBe(true)

    await expect(pending).resolves.toMatchObject({ status: 'partial', errorReason: expect.stringContaining('사용자가 최종 평가를 취소했습니다') })
    expect(service.cancelEvaluation('evaluation-to-cancel')).toBe(false)
    db.close()
  })
})
