import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const profilesTable = sqliteTable('profiles', {
  id: text('id').primaryKey(), name: text('name').notNull(), targetRole: text('target_role').notNull(),
  experienceLevel: text('experience_level').notNull(), contextMarkdown: text('context_markdown').notNull(),
  completeness: integer('completeness').notNull(), missingSectionsJson: text('missing_sections_json').notNull(),
  sourcesJson: text('sources_json').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
})

export const sessionsTable = sqliteTable('sessions', {
  id: text('id').primaryKey(), title: text('title').notNull(), configJson: text('config_json').notNull(),
  effectiveType: text('effective_type').notNull(), status: text('status').notNull(), questionPlanJson: text('question_plan_json'),
  researchJson: text('research_json'), reportJson: text('report_json'), recordingPath: text('recording_path'),
  errorReason: text('error_reason'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(), completedAt: text('completed_at')
})

export const turnsTable = sqliteTable('turns', {
  id: text('id').primaryKey(), sessionId: text('session_id').notNull().references(() => sessionsTable.id, { onDelete: 'cascade' }),
  payloadJson: text('payload_json').notNull(), createdAt: text('created_at').notNull()
})

export const aggregateStatsTable = sqliteTable('aggregate_stats', {
  topic: text('topic').primaryKey(), scoreSum: real('score_sum').notNull().default(0), attempts: integer('attempts').notNull().default(0)
})

export const recordingMarkersTable = sqliteTable('recording_markers', {
  turnId: text('turn_id').primaryKey().references(() => turnsTable.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().references(() => sessionsTable.id, { onDelete: 'cascade' }),
  startedAt: text('started_at').notNull(), completedAt: text('completed_at').notNull(), durationSeconds: real('duration_seconds').notNull()
})

export const settingsTable = sqliteTable('settings', { key: text('key').primaryKey(), valueJson: text('value_json').notNull() })

export const databaseSchema = { profilesTable, sessionsTable, turnsTable, aggregateStatsTable, recordingMarkersTable, settingsTable }
