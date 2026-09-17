/// <reference types="vite/client" />
import type { InterviewStudioApi } from '../../shared/contracts'

declare global {
  interface Window { interviewStudio: InterviewStudioApi }
}

export {}

