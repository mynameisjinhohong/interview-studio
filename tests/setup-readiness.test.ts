import { describe, expect, it } from 'vitest'
import {
  HIGH_QUALITY_STT_MODEL,
  canCompleteInitialSetup,
  interviewReadinessError,
  selectPreferredKoreanVoice
} from '../src/shared/setup-readiness.js'

describe('initial high-quality setup readiness', () => {
  const installedStt = {
    binary: 'C:\\Interview Studio\\whisper-cli.exe',
    models: { base: false, small: true, medium: false }
  }

  it('requires the recommended small model before setup can finish', () => {
    expect(HIGH_QUALITY_STT_MODEL).toBe('small')
    expect(canCompleteInitialSetup({
      consentAccepted: true,
      cliUsable: true,
      sttStatus: { ...installedStt, models: { ...installedStt.models, small: false } },
      voiceId: 'Microsoft Heami Desktop',
      voiceSamplePlayed: true
    })).toBe(false)
  })

  it('prefers a Korean natural voice over legacy and non-Korean voices', () => {
    expect(selectPreferredKoreanVoice([
      { id: 'english', name: 'Microsoft David', language: 'en-US' },
      { id: 'legacy', name: 'Microsoft Heami Desktop', language: 'ko-KR' },
      { id: 'natural', name: 'Microsoft SunHi Natural', language: 'ko-KR' }
    ])).toBe('natural')
  })

  it('prefers a Windows OneCore Korean voice over a legacy desktop voice', () => {
    expect(selectPreferredKoreanVoice([
      { id: 'sapi:heami', name: 'Microsoft Heami Desktop', language: 'ko-KR' },
      { id: 'onecore:heami', name: 'Microsoft Heami · Windows 최신', language: 'ko-KR' }
    ])).toBe('onecore:heami')
  })

  it('only completes after CLI, STT, voice selection and sample playback are ready', () => {
    expect(canCompleteInitialSetup({
      consentAccepted: true,
      cliUsable: true,
      sttStatus: installedStt,
      voiceId: 'legacy',
      voiceSamplePlayed: true
    })).toBe(true)
  })

  it('returns a user-facing preflight error instead of failing after an answer', () => {
    expect(interviewReadinessError({ binary: installedStt.binary, models: { ...installedStt.models, small: false } }, 'small'))
      .toContain('면접을 시작하기 전에')
    expect(interviewReadinessError(installedStt, 'small')).toBeNull()
  })
})
