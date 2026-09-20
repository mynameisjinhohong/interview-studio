import type { SttModel, SttStatus, TtsVoice } from './contracts.js'

export const HIGH_QUALITY_STT_MODEL: SttModel = 'small'

const normalizedLanguage = (language: string): string => language.replace('_', '-').toLowerCase()
const isKoreanVoice = (voice: TtsVoice): boolean => normalizedLanguage(voice.language).startsWith('ko')

const voiceScore = (voice: TtsVoice): number => {
  const label = `${voice.id} ${voice.name}`.toLowerCase()
  let score = isKoreanVoice(voice) ? 100 : 0
  if (/natural|premium|enhanced|sunhi|injoon/.test(label)) score += 50
  if (/onecore|windows 최신/.test(label)) score += 30
  if (/yuna|heami/.test(label)) score += 20
  if (/desktop|legacy/.test(label)) score -= 5
  return score
}

export const selectPreferredKoreanVoice = (voices: TtsVoice[]): string | null => {
  const korean = voices.filter(isKoreanVoice)
  if (!korean.length) return null
  return [...korean].sort((left, right) => voiceScore(right) - voiceScore(left))[0].id
}

export const koreanVoices = (voices: TtsVoice[]): TtsVoice[] => voices.filter(isKoreanVoice)

export const voiceQualityLabel = (voice: TtsVoice): string => {
  const label = `${voice.id} ${voice.name}`.toLowerCase()
  if (/natural|premium|enhanced|sunhi|injoon/.test(label)) return '자연 음성'
  if (/onecore|windows 최신/.test(label)) return 'Windows 최신 음성'
  return '시스템 음성'
}

export const interviewReadinessError = (status: SttStatus | null, model: SttModel): string | null => {
  if (!status?.binary) return '면접을 시작하기 전에 whisper-cli 실행 파일을 준비해야 합니다.'
  if (!status.models[model]) return `면접을 시작하기 전에 ${model} STT 모델을 다운로드해야 합니다.`
  return null
}

export const canCompleteInitialSetup = ({
  consentAccepted,
  cliUsable,
  sttStatus,
  voiceId,
  voiceSamplePlayed
}: {
  consentAccepted: boolean
  cliUsable: boolean
  sttStatus: SttStatus | null
  voiceId: string
  voiceSamplePlayed: boolean
}): boolean => consentAccepted
  && cliUsable
  && !interviewReadinessError(sttStatus, HIGH_QUALITY_STT_MODEL)
  && Boolean(voiceId)
  && voiceSamplePlayed
