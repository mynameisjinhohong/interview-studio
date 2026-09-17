import { z } from 'zod'
import { providerSchema } from '../shared/contracts.js'

export const createProfileSchema = z.object({
  name: z.string().trim().min(1).max(80), targetRole: z.string().trim().min(1).max(120),
  experienceLevel: z.string().trim().min(1).max(80), filePaths: z.array(z.string()).max(20),
  urls: z.array(z.string().url()).max(10), provider: providerSchema
})

export const idSchema = z.string().uuid()
export const completeTurnInputSchema = z.object({
  sessionId: idSchema, questionId: z.string().min(1).max(120), question: z.string().min(1).max(4_000),
  topic: z.string().min(1).max(300), depth: z.number().int().min(0).max(4),
  audioBytes: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= 100 * 1024 * 1024, '답변 오디오가 너무 큽니다.'),
  startedAt: z.string().datetime(), durationSeconds: z.number().min(0).max(330), timedOut: z.boolean(),
  replayUsed: z.boolean(), textRevealed: z.boolean(), editedTranscript: z.string().max(100_000).optional()
})
export const recordingChunkInputSchema = z.object({
  sessionId: idSchema,
  bytes: z.instanceof(Uint8Array).refine((bytes) => bytes.byteLength <= 32 * 1024 * 1024, '녹화 조각이 너무 큽니다.'),
  mimeType: z.enum(['video/webm;codecs=vp8,opus', 'audio/webm;codecs=opus']),
  sequence: z.number().int().min(0).max(1_000_000)
})

export const registerValidationHelpers = (): void => { /* explicit import point for IPC validation */ }
