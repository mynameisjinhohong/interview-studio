import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  finalReportSchema, followUpDecisionSchema, questionPlanSchema, sessionConfigSchema,
  type CompleteTurnInput, type FinalReport, type InterviewSession, type InterviewTurn, type SessionConfig
} from '../../shared/contracts.js'
import { finalReportJsonSchema, followUpJsonSchema, questionPlanJsonSchema } from '../../shared/llm-schemas.js'
import { normalizeFinalReport } from '../../shared/scoring.js'
import { nextInterviewStatus } from '../../shared/interview-machine.js'
import { MAX_FOLLOW_UPS, mustEndTopic } from '../../shared/interview-rules.js'
import { collectRecentQuestionExclusions, resolveQuestionStrategy } from '../../shared/question-strategy.js'
import { AppDatabase } from '../database.js'
import { CliRegistry } from './cli-adapters.js'
import { ResearchService } from './research-service.js'
import { SttService } from './stt-service.js'

const normalizePlan = (plan: ReturnType<typeof questionPlanSchema.parse>, count: number) => {
  if (plan.questions.length < count) throw new Error(`질문 계획이 ${count}개보다 적습니다.`)
  return {
    ...plan,
    questions: plan.questions.slice(0, count).map((question, index) => ({ ...question, id: question.id || `q-${index + 1}` }))
  }
}

const writeJsonAtomically = (path: string, value: unknown): void => {
  const temporary = `${path}.partial`
  writeFileSync(temporary, JSON.stringify(value, null, 2))
  renameSync(temporary, path)
}

export const latestTurnsByDepth = (turns: InterviewTurn[]): InterviewTurn[] => {
  const latest = new Map<number, InterviewTurn>()
  turns.forEach((turn) => latest.set(turn.depth, turn))
  return [...latest.values()].sort((a, b) => a.depth - b.depth)
}

export class InterviewService {
  private readonly activePreparations = new Map<string, AbortController>()
  private readonly activeEvaluations = new Map<string, AbortController>()

  constructor(private db: AppDatabase, private cli: CliRegistry, private research: ResearchService, private stt: SttService) {}

  async prepare(rawConfig: SessionConfig, requestId: string = crypto.randomUUID()): Promise<InterviewSession> {
    if (this.activePreparations.has(requestId)) throw new Error('이미 진행 중인 면접 준비 요청입니다.')
    const controller = new AbortController()
    this.activePreparations.set(requestId, controller)
    const config = sessionConfigSchema.parse(rawConfig)
    const profile = this.db.getProfile(config.profileId)
    if (!profile) {
      this.activePreparations.delete(requestId)
      throw new Error('선택한 프로필을 찾을 수 없습니다.')
    }
    this.db.enforceRetention()
    const recentQuestionExclusions = collectRecentQuestionExclusions(this.db.listSessions(), config)
    let session = this.db.createSession(config)
    try {
      const research = await this.research.research(config, profile, config.forceResearch, controller.signal)
      let effectiveType = config.type
      let effectiveStacks = config.stacks
      if (config.type === 'company' && !research.sufficientForCompany) {
        effectiveType = 'technical'
        effectiveStacks = research.inferredStacks.length ? research.inferredStacks : [config.role || profile.targetRole]
      }
      const strategy = resolveQuestionStrategy(config, effectiveType)
      const strategyPlanSchema = questionPlanSchema.superRefine((candidate, context) => {
        if (candidate.questions.length !== config.questionCount) {
          context.addIssue({ code: 'custom', message: `본 질문은 정확히 ${config.questionCount}개여야 합니다.` })
          return
        }
        for (const category of ['cs', 'portfolio', 'fit'] as const) {
          const actual = candidate.questions.filter((question) => question.category === category).length
          if (actual !== strategy.counts[category]) {
            context.addIssue({ code: 'custom', message: `${category} 질문은 ${strategy.counts[category]}개여야 하지만 ${actual}개입니다.` })
          }
        }
      })
      const plan = await this.cli.get(config.provider).invokeStructured(
        `한국어 ${effectiveType === 'company' ? '회사 맞춤' : '기술'} 면접의 본 질문 ${config.questionCount}개를 만드세요. 각 질문은 하나의 주제와 하나의 핵심 역량만 검증해야 합니다. 질문 계획 내부에서 핵심 역량과 질문 각도를 중복하지 마세요. recentQuestionExclusions와는 표현만 바꾸는 수준도 피하고, 같은 분야가 꼭 필요하면 난이도·상황·검증 관점을 실질적으로 다르게 만드세요. questionStrategy.counts의 문항 수를 지키세요. CS는 자료구조·알고리즘·운영체제·네트워크·언어/런타임·동시성·메모리·설계 원칙 등 직무 기본기, portfolio는 실제 프로젝트의 선택·트레이드오프·성과·문제 해결, fit은 협업·행동·회사/직무 적합성을 의미합니다. suggestedFollowUps는 실제 답변이 없을 때만 참고할 예시이며 최대 4개입니다.`,
        {
          mode: config.mode, experienceLevel: config.experienceLevel, stacks: effectiveStacks,
          focusAreas: config.focusAreas, excludedAreas: config.excludedAreas,
          company: effectiveType === 'company' ? config.company : '', role: config.role, stage: config.stage,
          questionStrategy: strategy, recentQuestionExclusions,
          profileContext: profile.contextMarkdown.slice(0, 24_000), research: research.summary,
          sources: research.sources.map(({ title, url, summary }) => ({ title, url, summary }))
        },
        questionPlanJsonSchema, strategyPlanSchema,
        { model: config.modelOverride, timeoutMs: null, idleTimeoutMs: null, signal: controller.signal }
      )
      const normalizedPlan = normalizePlan(plan, config.questionCount)
      const sessionFolder = join(this.db.root, 'sessions', session.id)
      mkdirSync(sessionFolder, { recursive: true })
      writeJsonAtomically(join(sessionFolder, 'research-snapshot.json'), research)
      writeJsonAtomically(join(sessionFolder, 'question-plan.json'), normalizedPlan)
      session = this.db.updateSession(session.id, {
        effectiveType, research, questionPlan: normalizedPlan, status: nextInterviewStatus(session.status, 'PREPARED')
      })
      return session
    } catch (error) {
      const reason = controller.signal.aborted ? '사용자가 면접 준비를 취소했습니다.' : error instanceof Error ? error.message : String(error)
      return this.db.updateSession(session.id, { status: nextInterviewStatus(session.status, 'FAIL'), errorReason: reason, completedAt: new Date().toISOString() })
    } finally {
      if (this.activePreparations.get(requestId) === controller) this.activePreparations.delete(requestId)
    }
  }

  cancelPreparation(requestId: string): boolean {
    const controller = this.activePreparations.get(requestId)
    if (!controller) return false
    controller.abort()
    return true
  }

  start(id: string): InterviewSession {
    const session = this.db.getSession(id)
    if (!session?.questionPlan) throw new Error('준비가 끝난 세션만 시작할 수 있습니다.')
    if (session.status !== 'ready') {
      if (!['completed', 'partial'].includes(session.status)) return this.db.updateSession(id, { errorReason: '앱 또는 장치 중단 후 마지막 완료 문항부터 복구됨' })
      return session
    }
    const deviceCheck = nextInterviewStatus(session.status, 'CHECK_DEVICES')
    return this.db.updateSession(id, { status: nextInterviewStatus(deviceCheck, 'ASK') })
  }

  async completeTurn(input: CompleteTurnInput): Promise<{ turn: InterviewTurn; decision: ReturnType<typeof followUpDecisionSchema.parse> }> {
    const session = this.db.getSession(input.sessionId)
    if (!session) throw new Error('세션을 찾을 수 없습니다.')
    if (session.status === 'asking') {
      const listening = nextInterviewStatus(session.status, 'LISTEN')
      this.db.updateSession(session.id, { status: nextInterviewStatus(listening, 'TRANSCRIBE') })
    }
    const folder = join(this.db.root, 'sessions', session.id, 'answers')
    mkdirSync(folder, { recursive: true })
    const audioPath = join(folder, `${crypto.randomUUID()}.webm`)
    writeFileSync(audioPath, Buffer.from(input.audioBytes))
    let transcript = input.editedTranscript?.trim() ?? ''
    if (!transcript && input.audioBytes.byteLength > 1_000) transcript = await this.stt.transcribe(audioPath, this.db.getSettings().sttModel)
    const turn: InterviewTurn = {
      id: crypto.randomUUID(), sessionId: session.id, questionId: input.questionId, question: input.question,
      topic: input.topic, depth: input.depth, transcript, audioPath, startedAt: input.startedAt,
      completedAt: new Date().toISOString(), durationSeconds: input.durationSeconds, timedOut: input.timedOut,
      replayUsed: input.replayUsed, textRevealed: input.textRevealed, shortFeedback: '', decisionAction: null, decisionQuestion: null
    }
    this.db.saveTurn(turn)
    this.db.updateSession(session.id, { status: nextInterviewStatus('transcribing', 'ANALYZE') })
    let decision: ReturnType<typeof followUpDecisionSchema.parse>
    if (mustEndTopic(input.depth, input.timedOut, transcript)) {
      const reason = input.depth >= MAX_FOLLOW_UPS ? '꼬리 질문 최대 깊이에 도달했습니다.' : input.timedOut ? '답변 제한 시간이 끝나 다음 주제로 이동합니다.' : '유효한 답변이 없어 다음 주제로 이동합니다.'
      decision = { action: 'next', question: null, reason, shortFeedback: '' }
    } else {
      const chain = latestTurnsByDepth([...session.turns, turn].filter((item) => item.questionId === input.questionId))
      decision = await this.cli.get(session.config.provider).invokeStructured(
        '현재 주제에 대해 답변을 더 검증할 가치가 있으면 하나의 짧은 꼬리 질문을 작성하고 follow-up을 선택하세요. 충분히 답했거나 주제가 마무리됐으면 next를 선택하세요. 꼬리 질문은 새 주제로 넘어가면 안 됩니다. 연습 모드일 때만 shortFeedback에 두 문장 이내의 코칭을 넣으세요.',
        { mode: session.config.mode, topic: input.topic, depth: input.depth, chain: chain.map(({ question, transcript }) => ({ question, transcript })) },
        followUpJsonSchema, followUpDecisionSchema,
        { model: session.config.modelOverride }
      )
    }
    turn.shortFeedback = session.config.mode === 'practice' ? decision.shortFeedback : ''
    turn.decisionAction = decision.action
    turn.decisionQuestion = decision.question
    this.db.saveTurn(turn)
    this.db.updateSession(session.id, { status: nextInterviewStatus('analyzing', decision.action === 'follow-up' ? 'FOLLOW_UP' : 'NEXT') })
    return { turn, decision }
  }

  async finish(id: string, partialReason?: string, requestId: string = crypto.randomUUID()): Promise<InterviewSession> {
    if (this.activeEvaluations.has(requestId)) throw new Error('이미 진행 중인 최종 평가 요청입니다.')
    const session = this.db.getSession(id)
    if (!session?.questionPlan) throw new Error('세션을 찾을 수 없습니다.')
    const controller = new AbortController()
    this.activeEvaluations.set(requestId, controller)
    let report: FinalReport
    let evaluationFailure = ''
    try { report = await this.evaluate(session, controller.signal) }
    catch (error) {
      evaluationFailure = controller.signal.aborted ? '사용자가 최종 평가를 취소했습니다.' : error instanceof Error ? error.message : String(error)
      report = normalizeFinalReport({
        totalScore: 0,
        summary: 'LLM 평가를 완료하지 못했습니다. 완료된 답변과 영상은 보존되었습니다.',
        strengths: [], improvements: ['CLI 상태를 확인한 뒤 전사를 수정해 재평가하세요.'], topics: []
      }, session.questionPlan.questions.map((question) => question.topic))
    } finally {
      if (this.activeEvaluations.get(requestId) === controller) this.activeEvaluations.delete(requestId)
    }
    const errorReason = [partialReason, evaluationFailure && `평가 실패: ${evaluationFailure}`].filter(Boolean).join(' · ')
    return this.db.updateSession(id, {
      report, status: errorReason ? 'partial' : 'completed', errorReason: errorReason || session.errorReason, completedAt: new Date().toISOString()
    })
  }

  cancelEvaluation(requestId: string): boolean {
    const controller = this.activeEvaluations.get(requestId)
    if (!controller) return false
    controller.abort()
    return true
  }

  async reevaluateAfterTranscript(turnId: string, transcript: string): Promise<InterviewSession> {
    const session = this.db.updateTurnTranscript(turnId, transcript)
    if (!session.report) return session
    const report = await this.evaluate(session)
    return this.db.updateSession(session.id, { report })
  }

  private async evaluate(session: InterviewSession, signal?: AbortSignal): Promise<FinalReport> {
    const questions = session.questionPlan!.questions
    const chains = questions.map((question) => ({
      topic: question.topic, question: question.question,
      turns: latestTurnsByDepth(session.turns.filter((turn) => turn.questionId === question.id)).map(({ question: asked, transcript, timedOut }) => ({ question: asked, transcript, timedOut }))
    }))
    const report = await this.cli.get(session.config.provider).invokeStructured(
      '면접 결과를 한국어로 평가하세요. 각 본 질문 체인을 동일 가중치로 평가하세요. 무응답 체인은 0점입니다. 기준은 질문 이해·관련성 25, 근거·구체성 25, 논리·깊이 25, 전달 구조 15, 간결성·시간 관리 10입니다. 답변에 없는 사실을 칭찬하거나 꾸미지 말고 구체적 근거를 제시하세요.',
      { effectiveType: session.effectiveType, mode: session.config.mode, chains },
      finalReportJsonSchema, finalReportSchema,
      { model: session.config.modelOverride, timeoutMs: null, idleTimeoutMs: null, signal }
    )
    return normalizeFinalReport(report, questions.map((question) => question.topic))
  }
}
