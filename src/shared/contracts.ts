import { z } from 'zod'

export const providerSchema = z.enum(['codex', 'claude', 'gemini'])
export const sessionTypeSchema = z.enum(['technical', 'company'])
export const sessionModeSchema = z.enum(['practice', 'real'])
export const sessionStatusSchema = z.enum([
  'draft', 'researching', 'ready', 'device-check', 'asking', 'listening',
  'transcribing', 'analyzing', 'paused', 'completed', 'partial'
])

export type Provider = z.infer<typeof providerSchema>
export type SessionType = z.infer<typeof sessionTypeSchema>
export type SessionMode = z.infer<typeof sessionModeSchema>
export type SessionStatus = z.infer<typeof sessionStatusSchema>
export type SttModel = 'base' | 'small' | 'medium'

export interface SttStatus {
  binary: string | null
  models: Record<SttModel, boolean>
}

export interface TtsVoice {
  id: string
  name: string
  language: string
  engine?: 'macos' | 'onecore' | 'sapi' | 'supertonic'
  gender?: 'female' | 'male'
}

export interface TtsVoicePack {
  id: string
  name: string
  description: string
  downloadSizeMb: number
  license: string
  installed: boolean
  voices: TtsVoice[]
}

export interface TtsVoiceCatalog {
  installed: TtsVoice[]
  packs: TtsVoicePack[]
}

export const sourceSchema = z.object({
  id: z.string(),
  kind: z.enum(['file', 'url', 'manual']),
  title: z.string(),
  location: z.string(),
  extractedText: z.string().default(''),
  extractionError: z.string().nullable().optional(),
  collectionMethod: z.enum(['file', 'direct-url', 'llm-web', 'manual']).optional(),
  collectionWarning: z.string().nullable().optional(),
  createdAt: z.string()
})

export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetRole: z.string(),
  experienceLevel: z.string(),
  contextMarkdown: z.string(),
  completeness: z.number().min(0).max(100),
  missingSections: z.array(z.string()),
  followUpQuestions: z.array(z.string()).default([]),
  sources: z.array(sourceSchema),
  createdAt: z.string(),
  updatedAt: z.string()
})

export type Profile = z.infer<typeof profileSchema>
export type ProfileSource = z.infer<typeof sourceSchema>

export const researchSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  publishedAt: z.string().nullable().default(null),
  collectedAt: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  summary: z.string()
})

export const researchSnapshotSchema = z.object({
  id: z.string(),
  kind: sessionTypeSchema,
  queryKey: z.string(),
  summary: z.string(),
  inferredStacks: z.array(z.string()).default([]),
  sources: z.array(researchSourceSchema),
  sufficientForCompany: z.boolean().default(false),
  createdAt: z.string(),
  expiresAt: z.string()
})

export type ResearchSnapshot = z.infer<typeof researchSnapshotSchema>

export const questionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  question: z.string(),
  intent: z.string(),
  sourceUrls: z.array(z.string()).default([]),
  suggestedFollowUps: z.array(z.string()).max(4).default([])
})

export const questionPlanSchema = z.object({
  title: z.string(),
  questions: z.array(questionSchema).min(3).max(10)
})

export type InterviewQuestion = z.infer<typeof questionSchema>
export type QuestionPlan = z.infer<typeof questionPlanSchema>

export const followUpDecisionSchema = z.object({
  action: z.enum(['follow-up', 'next']),
  question: z.string().nullable().default(null),
  reason: z.string(),
  shortFeedback: z.string().default('')
})

export type FollowUpDecision = z.infer<typeof followUpDecisionSchema>

export const scoreBreakdownSchema = z.object({
  relevance: z.number().min(0).max(25),
  evidence: z.number().min(0).max(25),
  depth: z.number().min(0).max(25),
  structure: z.number().min(0).max(15),
  concision: z.number().min(0).max(10)
})

export const topicEvaluationSchema = z.object({
  topic: z.string(),
  score: z.number().min(0).max(100),
  breakdown: scoreBreakdownSchema,
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  improvedAnswer: z.string()
})

export const finalReportSchema = z.object({
  totalScore: z.number().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  topics: z.array(topicEvaluationSchema)
})

export type TopicEvaluation = z.infer<typeof topicEvaluationSchema>
export type ScoreBreakdown = z.infer<typeof scoreBreakdownSchema>
export type FinalReport = z.infer<typeof finalReportSchema>

export const turnSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  questionId: z.string(),
  question: z.string(),
  topic: z.string(),
  depth: z.number().min(0).max(4),
  transcript: z.string(),
  audioPath: z.string().nullable().default(null),
  startedAt: z.string(),
  completedAt: z.string(),
  durationSeconds: z.number(),
  timedOut: z.boolean(),
  replayUsed: z.boolean(),
  textRevealed: z.boolean(),
  shortFeedback: z.string().default(''),
  decisionAction: z.enum(['follow-up', 'next']).nullable().default(null),
  decisionQuestion: z.string().nullable().default(null)
})

export type InterviewTurn = z.infer<typeof turnSchema>

export const sessionConfigSchema = z.object({
  profileId: z.string(),
  type: sessionTypeSchema,
  mode: sessionModeSchema,
  provider: providerSchema,
  modelOverride: z.string().max(200).optional(),
  questionCount: z.number().int().min(3).max(10).default(5),
  stacks: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  experienceLevel: z.string().trim().min(1).max(80),
  focusAreas: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  excludedAreas: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  company: z.string().trim().max(160).default(''),
  role: z.string().trim().max(160).default(''),
  stage: z.string().trim().max(160).default(''),
  jobPostText: z.string().max(120_000).default(''),
  jobPostUrl: z.union([z.literal(''), z.string().url().max(2_000)]).default(''),
  forceResearch: z.boolean().default(false)
})

export type SessionConfig = z.infer<typeof sessionConfigSchema>

export const sessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  config: sessionConfigSchema,
  effectiveType: sessionTypeSchema,
  status: sessionStatusSchema,
  questionPlan: questionPlanSchema.nullable(),
  research: researchSnapshotSchema.nullable(),
  turns: z.array(turnSchema),
  report: finalReportSchema.nullable(),
  recordingPath: z.string().nullable(),
  errorReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable()
})

export type InterviewSession = z.infer<typeof sessionSchema>

export const settingsSchema = z.object({
  consentAccepted: z.boolean().default(false),
  cliVerified: z.boolean().default(false),
  mediaSetupCompleted: z.boolean().default(false),
  defaultProvider: providerSchema.default('codex'),
  modelOverrides: z.record(providerSchema, z.string()).default({ codex: '', claude: '', gemini: '' }),
  ttsVoice: z.string().default(''),
  ttsRate: z.number().min(0.5).max(2).default(1),
  ttsPitch: z.number().min(-10).max(10).default(0),
  sttModel: z.enum(['base', 'small', 'medium']).default('small')
})

export type AppSettings = z.infer<typeof settingsSchema>

export interface CliProbeResult {
  provider: Provider
  installed: boolean
  path: string | null
  version: string | null
  authenticated: boolean | null
  capabilities: string[]
  error: string | null
}

export interface DashboardData {
  profiles: Profile[]
  sessions: InterviewSession[]
  aggregate: Array<{ topic: string; averageScore: number; attempts: number }>
  settings: AppSettings
}

export interface CreateProfileInput {
  name: string
  targetRole: string
  experienceLevel: string
  filePaths: string[]
  urls: string[]
  provider: Provider
  manualContext?: string
}

export interface CompleteTurnInput {
  sessionId: string
  questionId: string
  question: string
  topic: string
  depth: number
  audioBytes: Uint8Array
  startedAt: string
  durationSeconds: number
  timedOut: boolean
  replayUsed: boolean
  textRevealed: boolean
  editedTranscript?: string
}

export interface RecordingChunkInput {
  sessionId: string
  bytes: Uint8Array
  mimeType: string
  sequence: number
}

export interface InterviewStudioApi {
  bootstrap(): Promise<DashboardData>
  selectProfileFiles(): Promise<string[]>
  selectJobPostFile(): Promise<{ name: string; text: string } | null>
  createProfile(input: CreateProfileInput): Promise<Profile>
  regenerateProfile(id: string, provider: Provider): Promise<Profile>
  supplementProfile(id: string, provider: Provider, context: string): Promise<Profile>
  updateProfileContext(id: string, contextMarkdown: string): Promise<Profile>
  deleteProfile(id: string): Promise<void>
  saveSettings(settings: Partial<AppSettings>): Promise<AppSettings>
  probeClis(): Promise<CliProbeResult[]>
  testCli(provider: Provider): Promise<{ ok: true }>
  prepareSession(config: SessionConfig, requestId: string): Promise<InterviewSession>
  cancelSessionPreparation(requestId: string): Promise<boolean>
  retentionCandidate(): Promise<{ deletedTitle: string } | null>
  getSession(id: string): Promise<InterviewSession | null>
  startSession(id: string): Promise<InterviewSession>
  completeTurn(input: CompleteTurnInput): Promise<{ turn: InterviewTurn; decision: FollowUpDecision }>
  finishSession(id: string, partialReason?: string): Promise<InterviewSession>
  updateTranscript(turnId: string, transcript: string): Promise<InterviewSession>
  appendRecordingChunk(input: RecordingChunkInput): Promise<void>
  finalizeRecording(sessionId: string): Promise<string | null>
  listVoices(): Promise<TtsVoice[]>
  getVoiceCatalog(): Promise<TtsVoiceCatalog>
  installVoicePack(packId: string): Promise<TtsVoiceCatalog>
  renderSpeech(text: string, voice?: string, rate?: number): Promise<string>
  getMediaUrl(path: string): Promise<string>
  getSttStatus(): Promise<SttStatus>
  downloadSttModel(model: SttModel): Promise<{ path: string; sha256: string }>
  exportPdf(sessionId: string): Promise<string | null>
  exportVideo(sessionId: string): Promise<string | null>
  deleteAllData(): Promise<void>
}
