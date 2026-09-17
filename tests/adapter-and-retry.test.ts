import { describe, expect, it } from 'vitest'
import { parseStructuredJson } from '../src/main/services/cli-adapters.js'
import { latestTurnsByDepth } from '../src/main/services/interview-service.js'
import type { InterviewTurn } from '../src/shared/contracts.js'

const turn = (id: string, depth: number, transcript: string): InterviewTurn => ({
  id, sessionId: crypto.randomUUID(), questionId: 'q1', question: '질문', topic: '주제', depth, transcript,
  audioPath: null, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationSeconds: 30,
  timedOut: false, replayUsed: false, textRevealed: false, shortFeedback: '', decisionAction: 'next', decisionQuestion: null
})

describe('structured CLI responses', () => {
  it('parses Codex raw JSON and Claude/Gemini wrappers', () => {
    expect(parseStructuredJson('{"ok":true}')).toEqual({ ok: true })
    expect(parseStructuredJson('{"structured_output":{"ok":true}}')).toEqual({ ok: true })
    expect(parseStructuredJson('{"response":"{\\"ok\\":true}"}')).toEqual({ ok: true })
  })

  it('keeps only the last practice answer at each depth', () => {
    const selected = latestTurnsByDepth([turn('first', 0, '첫 답변'), turn('retry', 0, '재답변'), turn('follow', 1, '꼬리 답변')])
    expect(selected.map((item) => item.id)).toEqual(['retry', 'follow'])
  })
})
