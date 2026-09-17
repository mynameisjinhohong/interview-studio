import { describe, expect, it } from 'vitest'
import { nextInterviewStatus } from '../src/shared/interview-machine.js'

describe('interview state machine', () => {
  it('runs the complete interview lifecycle', () => {
    expect(nextInterviewStatus('draft', 'START_RESEARCH')).toBe('researching')
    expect(nextInterviewStatus('researching', 'PREPARED')).toBe('ready')
    expect(nextInterviewStatus('ready', 'CHECK_DEVICES')).toBe('device-check')
    expect(nextInterviewStatus('device-check', 'ASK')).toBe('asking')
    expect(nextInterviewStatus('asking', 'LISTEN')).toBe('listening')
    expect(nextInterviewStatus('listening', 'TRANSCRIBE')).toBe('transcribing')
    expect(nextInterviewStatus('transcribing', 'ANALYZE')).toBe('analyzing')
    expect(nextInterviewStatus('analyzing', 'FOLLOW_UP')).toBe('asking')
    expect(nextInterviewStatus('analyzing', 'COMPLETE')).toBe('completed')
  })

  it('supports practice pause and rejects invalid transitions', () => {
    expect(nextInterviewStatus('listening', 'PAUSE')).toBe('paused')
    expect(nextInterviewStatus('paused', 'RESUME')).toBe('listening')
    expect(() => nextInterviewStatus('ready', 'COMPLETE')).toThrow('허용되지 않은')
  })

  it('can terminate every active phase as partial', () => {
    for (const state of ['draft', 'researching', 'ready', 'device-check', 'asking', 'listening', 'paused', 'transcribing', 'analyzing'] as const) {
      expect(nextInterviewStatus(state, 'FAIL')).toBe('partial')
    }
  })
})
