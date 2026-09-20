import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppDatabase } from '../src/main/database.js'
import { InterviewService } from '../src/main/services/interview-service.js'
import type { Profile, ResearchSnapshot, SessionConfig } from '../src/shared/contracts.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

const config: SessionConfig = {
  profileId: 'profile', type: 'technical', mode: 'practice', provider: 'codex', questionCount: 3,
  stacks: ['C#'], experienceLevel: '신입', focusAreas: [], excludedAreas: [], company: '', role: '', stage: '', questionFocus: 'auto',
  jobPostText: '', jobPostUrl: '', forceResearch: false
}

const profile: Profile = {
  id: 'profile', name: '지원자', targetRole: '게임 클라이언트 개발자', experienceLevel: '신입',
  contextMarkdown: '# 프로필', completeness: 80, missingSections: [], followUpQuestions: [], sources: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
}

const researchSnapshot: ResearchSnapshot = {
  id: 'research', kind: 'technical', queryKey: 'query', summary: 'C# 면접 자료', inferredStacks: ['C#'], sources: [],
  sufficientForCompany: false, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString()
}

describe('session preparation execution policy', () => {
  it('runs research and question generation without a short wall-clock timeout and shares the cancellation signal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-preparation-')); roots.push(root)
    const db = new AppDatabase(root)
    db.saveProfile(profile)
    const research = { research: vi.fn().mockResolvedValue(researchSnapshot) }
    const invokeStructured = vi.fn().mockResolvedValue({
      title: 'C# 면접',
      questions: [1, 2, 3].map((index) => ({
        id: `q-${index}`, category: index <= 2 ? 'cs' : 'portfolio', topic: `주제 ${index}`, question: `질문 ${index}`, intent: '검증', sourceUrls: [], suggestedFollowUps: []
      }))
    })
    const cli = { get: vi.fn(() => ({ invokeStructured })) }
    const service = new InterviewService(db, cli as never, research as never, {} as never)

    const result = await service.prepare(config, 'request-1')

    expect(result.status).toBe('ready')
    const signal = research.research.mock.calls[0]?.[3]
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(invokeStructured.mock.calls[0]?.[4]).toMatchObject({ timeoutMs: null, idleTimeoutMs: null, signal })
    expect(invokeStructured.mock.calls[0]?.[1]).toMatchObject({
      stage: '', questionStrategy: { weights: { cs: 70, portfolio: 30, fit: 0 } }, recentQuestionExclusions: []
    })
    db.close()
  })

  it('returns a cancelled partial session after the active preparation is stopped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-preparation-cancel-')); roots.push(root)
    const db = new AppDatabase(root)
    db.saveProfile(profile)
    const research = { research: vi.fn((_config, _profile, _force, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })) }
    const service = new InterviewService(db, { get: vi.fn() } as never, research as never, {} as never)

    const pending = service.prepare(config, 'request-to-cancel')
    await vi.waitFor(() => expect(research.research).toHaveBeenCalledOnce())
    expect(service.cancelPreparation('request-to-cancel')).toBe(true)

    await expect(pending).resolves.toMatchObject({ status: 'partial', errorReason: '사용자가 면접 준비를 취소했습니다.' })
    expect(service.cancelPreparation('request-to-cancel')).toBe(false)
    db.close()
  })
})
