import type { InterviewSession, SessionConfig, SessionType } from './contracts.js'

export interface QuestionWeights {
  cs: number
  'portfolio-cs': number
  portfolio: number
  fit: number
}

export interface QuestionStrategy {
  label: string
  weights: QuestionWeights
  counts: QuestionWeights
}

const allocateCounts = (weights: QuestionWeights, total: number): QuestionWeights => {
  const entries = (Object.entries(weights) as Array<[keyof QuestionWeights, number]>).map(([key, weight]) => ({
    key, exact: weight * total / 100, count: Math.floor(weight * total / 100)
  }))
  let remaining = total - entries.reduce((sum, item) => sum + item.count, 0)
  entries.sort((a, b) => (b.exact - b.count) - (a.exact - a.count))
  for (let index = 0; index < entries.length && remaining > 0; index += 1, remaining -= 1) entries[index].count += 1
  return Object.fromEntries(entries.map(({ key, count }) => [key, count])) as unknown as QuestionWeights
}

export const resolveQuestionStrategy = (config: SessionConfig, effectiveType: SessionType): QuestionStrategy => {
  let strategy: Omit<QuestionStrategy, 'counts'>
  if (effectiveType === 'technical') strategy = { label: '기술 기본기 중심', weights: { cs: 70, 'portfolio-cs': 20, portfolio: 10, fit: 0 } }
  else if (config.stage.includes('1차')) strategy = { label: '1차 직무 면접 권장 구성', weights: { cs: 60, 'portfolio-cs': 15, portfolio: 15, fit: 10 } }
  else if (config.stage.includes('2차')) strategy = { label: '2차 심층 면접 권장 구성', weights: { cs: 20, 'portfolio-cs': 25, portfolio: 45, fit: 10 } }
  else if (config.stage.includes('임원')) strategy = { label: '임원 면접 권장 구성', weights: { cs: 10, 'portfolio-cs': 10, portfolio: 20, fit: 60 } }
  else strategy = { label: '회사 면접 균형 구성', weights: { cs: 40, 'portfolio-cs': 20, portfolio: 30, fit: 10 } }
  return { ...strategy, counts: allocateCounts(strategy.weights, config.questionCount) }
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '')

export const collectRecentQuestionExclusions = (
  sessions: InterviewSession[],
  config: SessionConfig,
  limit = 24
): Array<{ topic: string; question: string }> => {
  const stackKeys = new Set(config.stacks.map(normalize))
  return sessions
    .filter((session) => {
      if (!session.questionPlan || session.config.profileId !== config.profileId || session.config.type !== config.type) return false
      if (config.type === 'company') {
        return normalize(session.config.company) === normalize(config.company) && normalize(session.config.role) === normalize(config.role)
      }
      return session.config.stacks.some((stack) => stackKeys.has(normalize(stack)))
    })
    .flatMap((session) => session.questionPlan!.questions.map(({ topic, question }) => ({ topic, question })))
    .slice(0, limit)
}
