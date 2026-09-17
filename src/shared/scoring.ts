import type { FinalReport, ScoreBreakdown, TopicEvaluation } from './contracts.js'

export const scoreFromBreakdown = (breakdown: ScoreBreakdown): number => Math.round(
  breakdown.relevance + breakdown.evidence + breakdown.depth + breakdown.structure + breakdown.concision
)

export const equalTopicAverage = (topics: Pick<TopicEvaluation, 'score'>[]): number =>
  topics.length ? Math.round(topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length) : 0

export const normalizeFinalReport = (report: FinalReport, plannedTopics: string[]): FinalReport => {
  const remaining = [...report.topics]
  const topics = plannedTopics.map((plannedTopic) => {
    const index = remaining.findIndex((topic) => topic.topic === plannedTopic)
    const candidate = index >= 0 ? remaining.splice(index, 1)[0] : undefined
    if (!candidate) return {
      topic: plannedTopic, score: 0,
      breakdown: { relevance: 0, evidence: 0, depth: 0, structure: 0, concision: 0 },
      strengths: [], improvements: ['답변이 없어 평가할 수 없습니다.'], improvedAnswer: ''
    }
    return { ...candidate, score: scoreFromBreakdown(candidate.breakdown) }
  })
  return { ...report, topics, totalScore: equalTopicAverage(topics) }
}
