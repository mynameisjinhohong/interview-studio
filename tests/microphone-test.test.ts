import { describe, expect, it } from 'vitest'
import { hasRecordedMicrophoneSignal, microphoneLevelPercent } from '../src/shared/microphone-test.js'

describe('microphone test', () => {
  it('shows silence as zero input', () => {
    expect(microphoneLevelPercent(new Uint8Array(128).fill(128))).toBe(0)
    expect(hasRecordedMicrophoneSignal(0, 8_000)).toBe(false)
  })

  it('detects a recorded voice-like waveform', () => {
    const waveform = Uint8Array.from({ length: 128 }, (_, index) => index % 2 ? 148 : 108)
    const level = microphoneLevelPercent(waveform)
    expect(level).toBeGreaterThan(2)
    expect(hasRecordedMicrophoneSignal(level, 8_000)).toBe(true)
  })

  it('rejects an empty recording even if a level was observed', () => {
    expect(hasRecordedMicrophoneSignal(25, 0)).toBe(false)
  })
})
