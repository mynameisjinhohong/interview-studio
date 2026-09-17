import { describe, expect, it } from 'vitest'
import { equalTopicAverage, normalizeFinalReport, scoreFromBreakdown } from '../src/shared/scoring.js'

describe('interview scoring', () => {
  it('uses the fixed 25/25/25/15/10 rubric', () => {
    expect(scoreFromBreakdown({ relevance: 20, evidence: 18, depth: 17, structure: 12, concision: 8 })).toBe(75)
  })

  it('weights every base-question chain equally', () => {
    expect(equalTopicAverage([{ score: 100 }, { score: 50 }, { score: 0 }])).toBe(50)
  })

  it('forces unanswered and missing chains to zero', () => {
    const report = normalizeFinalReport({
      totalScore: 99, summary: 'summary', strengths: [], improvements: [],
      topics: [{ topic: 'C#', score: 99, breakdown: { relevance: 20, evidence: 20, depth: 20, structure: 10, concision: 10 }, strengths: [], improvements: [], improvedAnswer: '' }]
    }, ['C#', 'Unity'])
    expect(report.topics.map((topic) => topic.score)).toEqual([80, 0])
    expect(report.totalScore).toBe(40)
  })

  it('preserves repeated topics as separate chains', () => {
    const base = { breakdown: { relevance: 10, evidence: 10, depth: 10, structure: 10, concision: 10 }, strengths: [], improvements: [], improvedAnswer: '' }
    const report = normalizeFinalReport({ totalScore: 0, summary: '', strengths: [], improvements: [], topics: [
      { topic: '메모리', score: 0, ...base }, { topic: '메모리', score: 0, ...base, breakdown: { relevance: 20, evidence: 20, depth: 20, structure: 10, concision: 10 } }
    ] }, ['메모리', '메모리'])
    expect(report.topics.map((topic) => topic.score)).toEqual([50, 80])
    expect(report.totalScore).toBe(65)
  })
})
