const stringArray = { type: 'array', items: { type: 'string' } } as const

export const profileContextJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    markdown: { type: 'string' }, completeness: { type: 'number', minimum: 0, maximum: 100 },
    missingSections: stringArray, followUpQuestions: stringArray
  }, required: ['markdown', 'completeness', 'missingSections', 'followUpQuestions']
} as const

export const publicUrlContentJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, text: { type: 'string' }, sourceUrls: stringArray
  }, required: ['title', 'text', 'sourceUrls']
} as const

export const sourceDigestJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: { markdown: { type: 'string' } }, required: ['markdown']
} as const

const researchSource = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' }, url: { type: 'string' }, publishedAt: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, summary: { type: 'string' }
  }, required: ['title', 'url', 'publishedAt', 'confidence', 'summary']
} as const

export const researchJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' }, inferredStacks: stringArray,
    sources: { type: 'array', items: researchSource }, sufficientForCompany: { type: 'boolean' }
  }, required: ['summary', 'inferredStacks', 'sources', 'sufficientForCompany']
} as const

const question = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string' }, category: { type: 'string', enum: ['cs', 'portfolio', 'fit'] }, topic: { type: 'string' }, question: { type: 'string' }, intent: { type: 'string' },
    sourceUrls: stringArray, suggestedFollowUps: { type: 'array', maxItems: 4, items: { type: 'string' } }
  }, required: ['id', 'category', 'topic', 'question', 'intent', 'sourceUrls', 'suggestedFollowUps']
} as const

export const questionPlanJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: { title: { type: 'string' }, questions: { type: 'array', minItems: 3, maxItems: 10, items: question } },
  required: ['title', 'questions']
} as const

export const followUpJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['follow-up', 'next'] }, question: { type: ['string', 'null'] },
    reason: { type: 'string' }, shortFeedback: { type: 'string' }
  }, required: ['action', 'question', 'reason', 'shortFeedback']
} as const

const scoreBreakdown = {
  type: 'object', additionalProperties: false,
  properties: {
    relevance: { type: 'number', minimum: 0, maximum: 25 }, evidence: { type: 'number', minimum: 0, maximum: 25 },
    depth: { type: 'number', minimum: 0, maximum: 25 }, structure: { type: 'number', minimum: 0, maximum: 15 },
    concision: { type: 'number', minimum: 0, maximum: 10 }
  }, required: ['relevance', 'evidence', 'depth', 'structure', 'concision']
} as const

const topicEvaluation = {
  type: 'object', additionalProperties: false,
  properties: {
    topic: { type: 'string' }, score: { type: 'number', minimum: 0, maximum: 100 }, breakdown: scoreBreakdown,
    strengths: stringArray, improvements: stringArray, improvedAnswer: { type: 'string' }
  }, required: ['topic', 'score', 'breakdown', 'strengths', 'improvements', 'improvedAnswer']
} as const

export const finalReportJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    totalScore: { type: 'number', minimum: 0, maximum: 100 }, summary: { type: 'string' },
    strengths: stringArray, improvements: stringArray, topics: { type: 'array', items: topicEvaluation }
  }, required: ['totalScore', 'summary', 'strengths', 'improvements', 'topics']
} as const
