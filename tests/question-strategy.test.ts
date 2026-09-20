import { describe, expect, it } from 'vitest'
import { collectRecentQuestionExclusions, resolveQuestionStrategy } from '../src/shared/question-strategy.js'
import type { InterviewSession, SessionConfig } from '../src/shared/contracts.js'

const config = (stage: string, questionFocus: SessionConfig['questionFocus'] = 'auto'): SessionConfig => ({
  profileId: 'profile', type: 'company', mode: 'practice', provider: 'codex', questionCount: 5,
  stacks: [], experienceLevel: '신입', focusAreas: [], excludedAreas: [], company: '넥슨', role: '게임 클라이언트',
  stage, questionFocus, jobPostText: '', jobPostUrl: '', forceResearch: false
})

describe('question strategy', () => {
  it('makes first-round company interviews CS-heavy and second-round interviews portfolio-heavy', () => {
    expect(resolveQuestionStrategy(config('1차 직무 면접'), 'company').weights).toEqual({ cs: 60, portfolio: 25, fit: 15 })
    expect(resolveQuestionStrategy(config('2차 면접'), 'company').weights).toEqual({ cs: 25, portfolio: 60, fit: 15 })
  })

  it('lets an explicit focus override the stage recommendation', () => {
    expect(resolveQuestionStrategy(config('2차 면접', 'cs'), 'company').weights.cs).toBe(70)
    expect(resolveQuestionStrategy(config('1차 직무 면접', 'portfolio'), 'company').weights.portfolio).toBe(70)
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
