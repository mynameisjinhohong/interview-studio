import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings, DashboardData, InterviewSession, InterviewTurn, Profile, ResearchSnapshot, SessionConfig } from '../shared/contracts.js'
import { settingsSchema } from '../shared/contracts.js'
import { databaseSchema, settingsTable } from './db-schema.js'

const json = <T>(value: string | null, fallback: T): T => value ? JSON.parse(value) as T : fallback
const now = (): string => new Date().toISOString()

export class AppDatabase {
  readonly root: string
  readonly dbPath: string
  private db: Database.Database
  private orm: BetterSQLite3Database<typeof databaseSchema>

  constructor(root: string) {
    this.root = root
    this.dbPath = join(root, 'interview-studio.sqlite')
    mkdirSync(root, { recursive: true })
    for (const folder of ['profiles', 'sessions', 'cache', 'models', 'runtime', 'logs']) mkdirSync(join(root, folder), { recursive: true })
    this.db = new Database(this.dbPath)
    this.orm = drizzle(this.db, { schema: databaseSchema })
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, target_role TEXT NOT NULL, experience_level TEXT NOT NULL,
        context_markdown TEXT NOT NULL, completeness INTEGER NOT NULL, missing_sections_json TEXT NOT NULL,
        sources_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, config_json TEXT NOT NULL, effective_type TEXT NOT NULL,
        status TEXT NOT NULL, question_plan_json TEXT, research_json TEXT, report_json TEXT,
        recording_path TEXT, error_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        payload_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS aggregate_stats (
        topic TEXT PRIMARY KEY, score_sum REAL NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS recording_markers (
        turn_id TEXT PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL, completed_at TEXT NOT NULL, duration_seconds REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS turns_session_idx ON turns(session_id, created_at);
    `)
    const profileColumns = this.db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>
    if (!profileColumns.some((column) => column.name === 'follow_up_questions_json')) {
      this.db.exec("ALTER TABLE profiles ADD COLUMN follow_up_questions_json TEXT NOT NULL DEFAULT '[]'")
    }
  }

  getSettings(): AppSettings {
    const rows = this.orm.select().from(settingsTable).all()
    const partial = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.valueJson)]))
    return settingsSchema.parse(partial)
  }

  saveSettings(patch: Partial<AppSettings>): AppSettings {
    const next = settingsSchema.parse({ ...this.getSettings(), ...patch })
    const stmt = this.db.prepare('INSERT INTO settings(key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json')
    const tx = this.db.transaction(() => Object.entries(next).forEach(([key, value]) => stmt.run(key, JSON.stringify(value))))
    tx()
    return next
  }

  listProfiles(): Profile[] {
    const rows = this.db.prepare('SELECT * FROM profiles ORDER BY updated_at DESC').all() as any[]
    return rows.map((row) => ({
      id: row.id, name: row.name, targetRole: row.target_role, experienceLevel: row.experience_level,
      contextMarkdown: row.context_markdown, completeness: row.completeness,
      missingSections: json(row.missing_sections_json, []), sources: json(row.sources_json, []),
      followUpQuestions: json(row.follow_up_questions_json, []),
      createdAt: row.created_at, updatedAt: row.updated_at
    }))
  }

  getProfile(id: string): Profile | null { return this.listProfiles().find((profile) => profile.id === id) ?? null }

  saveProfile(profile: Profile): Profile {
    this.db.prepare(`INSERT INTO profiles(
        id,name,target_role,experience_level,context_markdown,completeness,missing_sections_json,sources_json,created_at,updated_at,follow_up_questions_json
      ) VALUES (@id,@name,@targetRole,@experienceLevel,@contextMarkdown,@completeness,@missing,@sources,@createdAt,@updatedAt,@followUpQuestions)
      ON CONFLICT(id) DO UPDATE SET name=@name,target_role=@targetRole,experience_level=@experienceLevel,context_markdown=@contextMarkdown,
      completeness=@completeness,missing_sections_json=@missing,sources_json=@sources,updated_at=@updatedAt,
      follow_up_questions_json=@followUpQuestions`).run({
      ...profile, missing: JSON.stringify(profile.missingSections), sources: JSON.stringify(profile.sources),
      followUpQuestions: JSON.stringify(profile.followUpQuestions)
    })
    return profile
  }

  updateProfileContext(id: string, contextMarkdown: string): Profile {
    this.db.prepare('UPDATE profiles SET context_markdown=?, updated_at=? WHERE id=?').run(contextMarkdown, now(), id)
    const profile = this.getProfile(id)
    if (!profile) throw new Error('프로필을 찾을 수 없습니다.')
    return profile
  }

  deleteProfile(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id=?').run(id)
    rmSync(join(this.root, 'profiles', id), { recursive: true, force: true })
  }

  createSession(config: SessionConfig): InterviewSession {
    const id = crypto.randomUUID()
    const createdAt = now()
    const label = config.type === 'company' ? `${config.company} ${config.role}`.trim() : config.stacks.join(', ')
    const session: InterviewSession = {
      id, title: `${label || '기술 면접'} · ${new Intl.DateTimeFormat('ko-KR').format(new Date())}`,
      config, effectiveType: config.type, status: 'researching', questionPlan: null, research: null,
      turns: [], report: null, recordingPath: null, errorReason: null, createdAt, updatedAt: createdAt, completedAt: null
    }
    this.db.prepare(`INSERT INTO sessions(id,title,config_json,effective_type,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?)`).run(id, session.title, JSON.stringify(config), session.effectiveType, session.status, createdAt, createdAt)
    return session
  }

  updateSession(id: string, patch: Partial<Omit<InterviewSession, 'id' | 'turns' | 'config' | 'createdAt'>> & { config?: SessionConfig }): InterviewSession {
    const current = this.getSession(id)
    if (!current) throw new Error('세션을 찾을 수 없습니다.')
    const next = { ...current, ...patch, updatedAt: now() }
    this.db.prepare(`UPDATE sessions SET title=?,config_json=?,effective_type=?,status=?,question_plan_json=?,research_json=?,report_json=?,recording_path=?,error_reason=?,updated_at=?,completed_at=? WHERE id=?`).run(
      next.title, JSON.stringify(next.config), next.effectiveType, next.status,
      next.questionPlan ? JSON.stringify(next.questionPlan) : null, next.research ? JSON.stringify(next.research) : null,
      next.report ? JSON.stringify(next.report) : null, next.recordingPath, next.errorReason, next.updatedAt, next.completedAt, id
    )
    return this.getSession(id)!
  }

  saveTurn(turn: InterviewTurn): InterviewTurn {
    this.db.prepare('INSERT OR REPLACE INTO turns(id,session_id,payload_json,created_at) VALUES(?,?,?,?)')
      .run(turn.id, turn.sessionId, JSON.stringify(turn), turn.completedAt)
    this.db.prepare('INSERT OR REPLACE INTO recording_markers(turn_id,session_id,started_at,completed_at,duration_seconds) VALUES(?,?,?,?,?)')
      .run(turn.id, turn.sessionId, turn.startedAt, turn.completedAt, turn.durationSeconds)
    this.db.prepare('UPDATE sessions SET updated_at=? WHERE id=?').run(now(), turn.sessionId)
    return turn
  }

  updateTurnTranscript(turnId: string, transcript: string): InterviewSession {
    const row = this.db.prepare('SELECT session_id,payload_json FROM turns WHERE id=?').get(turnId) as { session_id: string; payload_json: string } | undefined
    if (!row) throw new Error('답변 기록을 찾을 수 없습니다.')
    const turn = { ...JSON.parse(row.payload_json), transcript }
    this.db.prepare('UPDATE turns SET payload_json=? WHERE id=?').run(JSON.stringify(turn), turnId)
    return this.getSession(row.session_id)!
  }

  getSession(id: string): InterviewSession | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as any
    if (!row) return null
    const turns = (this.db.prepare('SELECT payload_json FROM turns WHERE session_id=? ORDER BY created_at').all(id) as Array<{ payload_json: string }>).map((item) => JSON.parse(item.payload_json))
    return {
      id: row.id, title: row.title, config: JSON.parse(row.config_json), effectiveType: row.effective_type,
      status: row.status, questionPlan: json(row.question_plan_json, null), research: json(row.research_json, null),
      turns, report: json(row.report_json, null), recordingPath: row.recording_path, errorReason: row.error_reason,
      createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at
    }
  }

  listSessions(): InterviewSession[] {
    const rows = this.db.prepare('SELECT id FROM sessions ORDER BY created_at DESC LIMIT 10').all() as Array<{ id: string }>
    return rows.map((row) => this.getSession(row.id)!).filter(Boolean)
  }

  retentionCandidate(): { deletedTitle: string } | null {
    const row = this.db.prepare('SELECT title FROM sessions ORDER BY created_at ASC LIMIT 1 OFFSET 9').get() as { title: string } | undefined
    return row ? { deletedTitle: row.title } : null
  }

  enforceRetention(): { deletedTitle: string } | null {
    const rows = this.db.prepare('SELECT id,title,report_json,status FROM sessions ORDER BY created_at DESC').all() as any[]
    if (rows.length < 10) return null
    const oldest = rows.at(-1)
    if (oldest.status === 'completed' && oldest.report_json) {
      const report = JSON.parse(oldest.report_json)
      const upsert = this.db.prepare(`INSERT INTO aggregate_stats(topic,score_sum,attempts) VALUES(?,?,1)
        ON CONFLICT(topic) DO UPDATE SET score_sum=score_sum+excluded.score_sum,attempts=attempts+1`)
      this.db.transaction(() => report.topics?.forEach((topic: any) => upsert.run(topic.topic, topic.score)))()
    }
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(oldest.id)
    rmSync(join(this.root, 'sessions', oldest.id), { recursive: true, force: true })
    return { deletedTitle: oldest.title }
  }

  dashboard(): DashboardData {
    const totals = new Map<string, { scoreSum: number; attempts: number }>()
    const historical = this.db.prepare('SELECT topic,score_sum,attempts FROM aggregate_stats').all() as Array<{ topic: string; score_sum: number; attempts: number }>
    historical.forEach((row) => totals.set(row.topic, { scoreSum: row.score_sum, attempts: row.attempts }))
    const activeReports = this.db.prepare("SELECT report_json FROM sessions WHERE status='completed' AND report_json IS NOT NULL").all() as Array<{ report_json: string }>
    activeReports.forEach(({ report_json }) => {
      const report = JSON.parse(report_json) as { topics?: Array<{ topic: string; score: number }> }
      report.topics?.forEach((topic) => {
        const current = totals.get(topic.topic) ?? { scoreSum: 0, attempts: 0 }
        totals.set(topic.topic, { scoreSum: current.scoreSum + topic.score, attempts: current.attempts + 1 })
      })
    })
    const aggregate = [...totals.entries()]
      .map(([topic, value]) => ({ topic, averageScore: Math.round(value.scoreSum / value.attempts), attempts: value.attempts }))
      .sort((a, b) => a.averageScore - b.averageScore)
    return { profiles: this.listProfiles(), sessions: this.listSessions(), aggregate, settings: this.getSettings() }
  }

  deleteAll(): void {
    this.db.close()
    rmSync(this.root, { recursive: true, force: true })
    mkdirSync(this.root, { recursive: true })
    this.db = new Database(this.dbPath)
    this.orm = drizzle(this.db, { schema: databaseSchema })
    this.migrate()
  }

  close(): void { this.db.close() }
}
