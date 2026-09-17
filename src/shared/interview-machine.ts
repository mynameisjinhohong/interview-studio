import { createMachine, getNextSnapshot } from 'xstate'
import type { SessionStatus } from './contracts.js'

export type InterviewEvent =
  | 'START_RESEARCH' | 'PREPARED' | 'CHECK_DEVICES' | 'ASK'
  | 'LISTEN' | 'TRANSCRIBE' | 'ANALYZE' | 'FOLLOW_UP'
  | 'NEXT' | 'PAUSE' | 'RESUME' | 'COMPLETE' | 'FAIL'

export const interviewMachine = createMachine({
  id: 'interview-session',
  initial: 'draft',
  states: {
    draft: { on: { START_RESEARCH: 'researching', FAIL: 'partial' } },
    researching: { on: { PREPARED: 'ready', FAIL: 'partial' } },
    ready: { on: { CHECK_DEVICES: 'device-check', FAIL: 'partial' } },
    'device-check': { on: { ASK: 'asking', FAIL: 'partial' } },
    asking: { on: { LISTEN: 'listening', FAIL: 'partial' } },
    listening: { on: { TRANSCRIBE: 'transcribing', PAUSE: 'paused', FAIL: 'partial' } },
    paused: { on: { RESUME: 'listening', FAIL: 'partial' } },
    transcribing: { on: { ANALYZE: 'analyzing', FAIL: 'partial' } },
    analyzing: { on: { FOLLOW_UP: 'asking', NEXT: 'asking', COMPLETE: 'completed', FAIL: 'partial' } },
    completed: { type: 'final' },
    partial: { type: 'final' }
  }
})

export const nextInterviewStatus = (current: SessionStatus, event: InterviewEvent): SessionStatus => {
  const snapshot = interviewMachine.resolveState({ value: current })
  const next = getNextSnapshot(interviewMachine, snapshot, { type: event })
  if (next.value === current) throw new Error(`허용되지 않은 면접 상태 전이입니다: ${current} + ${event}`)
  return next.value as SessionStatus
}
