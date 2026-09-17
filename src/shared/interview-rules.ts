export const ANSWER_LIMIT_SECONDS = 300
export const MAX_FOLLOW_UPS = 4

export const answerWarning = (remainingSeconds: number): 'none' | 'one-minute' | 'ten-seconds' =>
  remainingSeconds <= 10 ? 'ten-seconds' : remainingSeconds <= 60 ? 'one-minute' : 'none'

export const mustEndTopic = (depth: number, timedOut: boolean, transcript: string): boolean =>
  depth >= MAX_FOLLOW_UPS || timedOut || transcript.trim().length === 0
