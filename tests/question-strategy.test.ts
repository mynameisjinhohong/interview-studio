import { describe, expect, it } from 'vitest'
import { collectRecentQuestionExclusions, resolveQuestionStrategy } from '../src/shared/question-strategy.js'
import { sessionConfigSchema, type InterviewSession, type SessionConfig } from '../src/shared/contracts.js'

const config = (stage: string): SessionConfig => ({
  profileId: 'profile', type: 'company', mode: 'practice', provider: 'codex', questionCount: 5,
  stacks: [], experienceLevel: '신입', focusAreas: [], excludedAreas: [], company: '넥슨', role: '게임 클라이언트',
  stage, jobPostText: '', jobPostUrl: '', forceResearch: false
})

describe('question strategy', () => {
  it('makes first-round company interviews CS-heavy and second-round interviews portfolio-heavy', () => {
    const firstRound = resolveQuestionStrategy(config('1차 직무 면접'), 'company')
    const secondRound = resolveQuestionStrategy(config('2차 면접'), 'company')
    expect(firstRound.weights).toEqual({ cs: 60, 'portfolio-cs': 15, portfolio: 15, fit: 10 })
    expect(firstRound.counts).toEqual({ cs: 3, 'portfolio-cs': 1, portfolio: 1, fit: 0 })
    expect(secondRound.weights).toEqual({ cs: 20, 'portfolio-cs': 25, portfolio: 45, fit: 10 })
    expect(secondRound.counts).toEqual({ cs: 1, 'portfolio-cs': 1, portfolio: 2, fit: 1 })
  })

  it('does not keep the removed question focus setting', () => {
    expect(sessionConfigSchema.parse({ ...config('1차 직무 면접'), questionFocus: 'portfolio' })).not.toHaveProperty('questionFocus')
  })

  it('excludes recent questions from the same company, role, and profile', () => {
    const prior = {
      id: 'prior', config: config('1차 직무 면접'),
      questionPlan: { title: '넥슨', questions: [{ id: 'q1', category: 'cs', topic: '프로세스와 스레드', question: '프로세스와 스레드의 차이는 무엇인가요?', intent: '', sourceUrls: [], suggestedFollowUps: [] }] }
    } as unknown as InterviewSession
    const other = {
      ...prior, id: 'other', config: { ...prior.config, company: '웹젠' },
      questionPlan: { title: '웹젠', questions: [{ id: 'q2', category: 'cs', topic: '메모리', question: '메모리 질문', intent: '', sourceUrls: [], suggestedFollowUps: [] }] }
    } as unknown as InterviewSession

    expect(collectRecentQuestionExclusions([other, prior], config('1차 직무 면접'))).toEqual([
      { topic: '프로세스와 스레드', question: '프로세스와 스레드의 차이는 무엇인가요?' }
    ])
  })
})
