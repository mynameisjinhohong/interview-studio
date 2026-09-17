import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

export class DiagnosticLogger {
  private readonly file: string
  constructor(root: string) { this.file = join(root, 'logs', 'diagnostic.log') }

  write(event: string, fields: Record<string, string | number | boolean | null> = {}): void {
    try {
      if (existsSync(this.file) && statSync(this.file).size > 2_000_000) renameSync(this.file, `${this.file}.1`)
      appendFileSync(this.file, `${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`)
    } catch { /* diagnostics must never break the interview */ }
  }
}

