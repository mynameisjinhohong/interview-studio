import { describe, expect, it } from 'vitest'
import { ANSWER_LIMIT_SECONDS, answerWarning, mustEndTopic } from '../src/shared/interview-rules.js'
import { isResearchCacheFresh, researchCacheDays } from '../src/main/services/research-service.js'

describe('time and follow-up rules', () => {
  it('uses a five minute answer limit with 60 and 10 second warnings', () => {
    expect(ANSWER_LIMIT_SECONDS).toBe(300)
    expect(answerWarning(61)).toBe('none')
    expect(answerWarning(60)).toBe('one-minute')
    expect(answerWarning(10)).toBe('ten-seconds')
  })

  it('ends after four follow-ups, timeout, or no answer', () => {
    expect(mustEndTopic(3, false, '답변')).toBe(false)
    expect(mustEndTopic(4, false, '답변')).toBe(true)
    expect(mustEndTopic(0, true, '답변')).toBe(true)
    expect(mustEndTopic(0, false, '  ')).toBe(true)
  })
})

describe('research cache rules', () => {
  it('uses seven days for companies and thirty for technical research', () => {
    expect(researchCacheDays('company')).toBe(7)
    expect(researchCacheDays('technical')).toBe(30)
  })

  it('rejects an expired snapshot', () => {
    const now = Date.parse('2026-09-14T00:00:00.000Z')
    expect(isResearchCacheFresh({ expiresAt: '2026-09-14T00:00:01.000Z' }, now)).toBe(true)
    expect(isResearchCacheFresh({ expiresAt: '2026-09-13T23:59:59.000Z' }, now)).toBe(false)
  })
})
