import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import mammoth from 'mammoth'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createWorker } from 'tesseract.js'
import { createCanvas } from '@napi-rs/canvas'
import type { CreateProfileInput, Profile, ProfileSource } from '../../shared/contracts.js'
import { profileContextJsonSchema, sourceDigestJsonSchema } from '../../shared/llm-schemas.js'
import { AppDatabase } from '../database.js'
import { CliRegistry, structuredProfileResult, structuredSourceDigestResult, type InvokeOptions } from './cli-adapters.js'
import { PublicUrlReader, type ProfileUrlReader } from './url-content-service.js'

const safeName = (name: string): string => name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 120)
const PROFILE_ANALYSIS_TOTAL_MS = 5 * 60_000
const PROFILE_IDLE_TIMEOUT_MS = 90_000
const DIRECT_ANALYSIS_LIMIT = 32_000
const SOURCE_CHUNK_CHARS = 18_000
const DIGEST_PHASE_MS = 3 * 60_000
const MAX_PROFILE_INPUT_CHARS = 120_000

interface BudgetedSource { source: ProfileSource; text: string }
interface SourceDigest {
  key: string
  sourceId: string
  title: string
  location: string
  chunkIndex: number
  chunkCount: number
  contentHash: string
  markdown: string
  status: 'summarized' | 'fallback'
  error: string | null
}

interface DigestCheckpoint {
  version: 1
  mode: 'direct' | 'staged'
  status: 'in-progress' | 'merging' | 'completed' | 'partial'
  updatedAt: string
  fallbackChunks: number
  entries: SourceDigest[]
}

const writeJsonAtomically = (path: string, value: unknown): void => {
  const temporary = `${path}.partial`
  writeFileSync(temporary, JSON.stringify(value, null, 2))
  renameSync(temporary, path)
}

const contentHash = (text: string): string => createHash('sha256').update(text).digest('hex')

export const splitProfileText = (text: string, limit = SOURCE_CHUNK_CHARS): string[] => {
  const chunks: string[] = []
  let current = ''
  const append = (part: string): void => {
    if (!part) return
    if (current && current.length + part.length + 1 > limit) { chunks.push(current); current = '' }
    if (part.length <= limit) { current = current ? `${current}\n${part}` : part; return }
    if (current) { chunks.push(current); current = '' }
    for (let offset = 0; offset < part.length; offset += limit) chunks.push(part.slice(offset, offset + limit))
  }
  text.split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach(append)
  if (current) chunks.push(current)
  return chunks
}

const missingFromText = (text: string): string[] => {
  const rules: Array<[string, RegExp]> = [
    ['경력과 역할', /경력|역할|담당|직무/], ['기술 스택', /기술|스택|언어|프레임워크|Unity|React|Java|C#|Python/i],
    ['프로젝트', /프로젝트|서비스|제품/], ['성과', /성과|개선|증가|감소|최적화|%/], ['문제 해결 사례', /문제|해결|장애|트러블|원인/]
  ]
  return rules.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label)
}

export class ProfileService {
  constructor(
    private db: AppDatabase,
    private cli: CliRegistry,
    private urlReader: ProfileUrlReader = new PublicUrlReader()
  ) {}

  async extractFile(path: string): Promise<string> {
    const extension = extname(path).toLowerCase()
    if (['.txt', '.md'].includes(extension)) return readFileSync(path, 'utf8')
    if (extension === '.docx') return (await mammoth.extractRawText({ path })).value
    if (extension === '.pdf') {
      const document = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) }).promise
      const pages: string[] = []
      for (let index = 1; index <= document.numPages; index += 1) {
        const content = await (await document.getPage(index)).getTextContent()
        pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
      }
      if (pages.join('').replace(/\s/g, '').length < Math.max(80, document.numPages * 20)) {
        const worker = await createWorker('kor+eng')
        try {
          for (let index = 1; index <= Math.min(document.numPages, 30); index += 1) {
            const page = await document.getPage(index)
            const viewport = page.getViewport({ scale: 1.6 })
            const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
            await page.render({ canvas: canvas as never, canvasContext: canvas.getContext('2d') as never, viewport }).promise
            pages[index - 1] = (await worker.recognize(canvas.toBuffer('image/png'))).data.text
          }
        } finally { await worker.terminate() }
      }
      return pages.join('\n\n')
    }
    if (['.png', '.jpg', '.jpeg'].includes(extension)) {
      const worker = await createWorker('kor+eng')
      try { return (await worker.recognize(path)).data.text } finally { await worker.terminate() }
    }
    throw new Error(`지원하지 않는 파일 형식입니다: ${extension}`)
  }

  private budgetedSources(sources: ProfileSource[]): BudgetedSource[] {
    const readable = sources.filter((source) => source.extractedText.trim())
    if (!readable.length) return []
    const allocations = new Map<string, number>()
    let remaining = Math.max(1_000, MAX_PROFILE_INPUT_CHARS - readable.length * 320)
    const shortestFirst = [...readable].sort((a, b) => a.extractedText.length - b.extractedText.length)
    shortestFirst.forEach((source, index) => {
      const fairShare = Math.max(1_000, Math.floor(remaining / (shortestFirst.length - index)))
      const allocated = Math.min(source.extractedText.length, fairShare)
      allocations.set(source.id, allocated)
      remaining -= allocated
    })
    return readable.map((source) => ({ source, text: source.extractedText.slice(0, allocations.get(source.id) ?? 1_000) }))
  }

  private combinedDocuments(budgeted: BudgetedSource[]): string {
    return budgeted.map(({ source, text }) => [
      `<<<SOURCE kind="${source.kind}" title="${source.title}" location="${source.location}">>>`,
      text,
      '<<<END_SOURCE>>>'
    ].join('\n')).join('\n\n').slice(0, MAX_PROFILE_INPUT_CHARS)
  }

  private invokeOptions(deadline: number, maximumMs: number): InvokeOptions {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('프로필 컨텍스트 분석의 5분 전체 제한을 초과했습니다.')
    const timeoutMs = Math.max(1, Math.min(maximumMs, remaining))
    return {
      allowWeb: false, timeoutMs,
      idleTimeoutMs: Math.min(PROFILE_IDLE_TIMEOUT_MS, timeoutMs),
      retries: 0
    }
  }

  private readCheckpoint(path: string): DigestCheckpoint | null {
    if (!existsSync(path)) return null
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as DigestCheckpoint
      return parsed.version === 1 && Array.isArray(parsed.entries) ? parsed : null
    } catch { return null }
  }

  private writeCheckpoint(path: string, mode: DigestCheckpoint['mode'], status: DigestCheckpoint['status'], entries: SourceDigest[]): void {
    writeJsonAtomically(path, {
      version: 1, mode, status, updatedAt: new Date().toISOString(),
      fallbackChunks: entries.filter((entry) => entry.status === 'fallback').length,
      entries: [...entries].sort((a, b) => a.key.localeCompare(b.key))
    } satisfies DigestCheckpoint)
  }

  private fallbackContext(input: Pick<CreateProfileInput, 'name' | 'targetRole' | 'experienceLevel'>, documents: string) {
    const missingSections = missingFromText(documents)
    return {
      markdown: `# ${input.name}\n\n- 목표 직무: ${input.targetRole}\n- 경력 수준: ${input.experienceLevel}\n\n## 추출 자료\n\n${documents || '추출된 문서 내용이 없습니다.'}`,
      completeness: Math.max(0, 100 - missingSections.length * 20), missingSections
    }
  }

  private async analyzeStaged(
    input: Pick<CreateProfileInput, 'name' | 'targetRole' | 'experienceLevel' | 'provider'>,
    budgeted: BudgetedSource[], urls: Array<Record<string, unknown>>, folder: string, deadline: number
  ) {
    const adapter = this.cli.get(input.provider)
    const checkpointPath = join(folder, 'source-digests.json')
    const previous = this.readCheckpoint(checkpointPath)
    const reusable = new Map(previous?.entries.filter((entry) => entry.status === 'summarized').map((entry) => [entry.key, entry]) ?? [])
    const jobs = budgeted.flatMap(({ source, text }) => {
      const chunks = splitProfileText(text)
      return chunks.map((content, chunkIndex) => {
        const hash = contentHash(content)
        return {
          key: `${source.id}:${chunkIndex}:${hash}`, source, content,
          chunkIndex, chunkCount: chunks.length, contentHash: hash
        }
      })
    })
    const entries = new Array<SourceDigest>(jobs.length)
    jobs.forEach((job, index) => { const cached = reusable.get(job.key); if (cached) entries[index] = cached })
    this.writeCheckpoint(checkpointPath, 'staged', 'in-progress', entries.filter(Boolean))

    const digestDeadline = Math.min(deadline, Date.now() + DIGEST_PHASE_MS)
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const index = cursor
        cursor += 1
        if (entries[index]) continue
        const job = jobs[index]
        const entryBase = {
          key: job.key, sourceId: job.source.id, title: job.source.title, location: job.source.location,
          chunkIndex: job.chunkIndex, chunkCount: job.chunkCount, contentHash: job.contentHash
        }
        let entry: SourceDigest
        if (digestDeadline - Date.now() < 1_000) {
          entry = {
            ...entryBase,
            markdown: job.content.slice(0, 6_000), status: 'fallback', error: '자료별 요약 시간 예산 소진'
          }
        } else {
          try {
            const result = await adapter.invokeStructured(
              '프로필 자료 조각에서 면접에 유용한 사실만 한국어 Markdown으로 요약하세요. 경력 기간, 본인 역할, 기술, 프로젝트, 수치 성과, 문제와 해결 과정을 보존하고 추측하지 마세요. 모든 항목에 제공된 출처 제목 또는 URL을 붙이세요.',
              {
                source: { title: job.source.title, location: job.source.location, kind: job.source.kind },
                chunkIndex: job.chunkIndex + 1, chunkCount: job.chunkCount, content: job.content
              },
              sourceDigestJsonSchema, structuredSourceDigestResult,
              this.invokeOptions(digestDeadline, 120_000)
            )
            entry = {
              ...entryBase,
              markdown: result.markdown, status: 'summarized', error: null
            }
          } catch (error) {
            entry = {
              ...entryBase,
              markdown: job.content.slice(0, 6_000), status: 'fallback',
              error: error instanceof Error ? error.message : String(error)
            }
          }
        }
        entries[index] = entry
        this.writeCheckpoint(checkpointPath, 'staged', 'in-progress', entries.filter(Boolean))
      }
    }
    await Promise.all([worker(), worker()])

    const digestDocuments = entries.map((entry) => [
      `<<<SOURCE_DIGEST title="${entry.title}" location="${entry.location}" part="${entry.chunkIndex + 1}/${entry.chunkCount}">>>`,
      entry.markdown,
      '<<<END_SOURCE_DIGEST>>>'
    ].join('\n')).join('\n\n').slice(0, MAX_PROFILE_INPUT_CHARS)
    this.writeCheckpoint(checkpointPath, 'staged', 'merging', entries)
    try {
      const generated = await adapter.invokeStructured(
        '자료별 요약을 중복 제거하여 하나의 최종 면접 컨텍스트로 병합하세요. 경력, 역할, 기술, 프로젝트, 수치 성과, 문제 해결 사례를 구분하고 각 사실에 [출처: 제목 또는 URL]을 붙이세요. 자료에 없는 사실은 추측하지 마세요.',
        { name: input.name, targetRole: input.targetRole, experienceLevel: input.experienceLevel, documents: digestDocuments, urls, pipeline: 'staged' },
        profileContextJsonSchema, structuredProfileResult,
        this.invokeOptions(deadline, PROFILE_ANALYSIS_TOTAL_MS)
      )
      this.writeCheckpoint(checkpointPath, 'staged', 'completed', entries)
      return generated
    } catch {
      this.writeCheckpoint(checkpointPath, 'staged', 'partial', entries)
      return this.fallbackContext(input, digestDocuments)
    }
  }

  private async analyze(
    input: Pick<CreateProfileInput, 'name' | 'targetRole' | 'experienceLevel' | 'provider'>,
    sources: ProfileSource[], folder: string
  ) {
    const budgeted = this.budgetedSources(sources)
    const combined = this.combinedDocuments(budgeted)
    const urls = sources.filter((source) => source.kind === 'url').map((source) => ({
      url: source.location, title: source.title, extractionError: source.extractionError ?? null,
      extractedCharacters: source.extractedText.length
    }))
    const deadline = Date.now() + PROFILE_ANALYSIS_TOTAL_MS
    let generated: { markdown: string; completeness: number; missingSections: string[] }
    try {
      if (combined.length > DIRECT_ANALYSIS_LIMIT) {
        generated = await this.analyzeStaged(input, budgeted, urls, folder, deadline)
      } else {
        generated = await this.cli.get(input.provider).invokeStructured(
          '앱이 직접 추출한 documents 원문만 근거로 최종 면접 컨텍스트를 한국어로 작성하세요. 경력, 역할, 기술, 프로젝트, 수치 성과, 문제 해결 사례를 구분하고 각 사실에 [출처: 제목 또는 URL]을 붙이세요. 웹을 다시 열거나 자료에 없는 사실을 추측하지 마세요.',
          { name: input.name, targetRole: input.targetRole, experienceLevel: input.experienceLevel, documents: combined, urls, pipeline: 'direct' },
          profileContextJsonSchema, structuredProfileResult,
          this.invokeOptions(deadline, PROFILE_ANALYSIS_TOTAL_MS)
        )
        this.writeCheckpoint(join(folder, 'source-digests.json'), 'direct', 'completed', [])
      }
    } catch {
      this.writeCheckpoint(join(folder, 'source-digests.json'), combined.length > DIRECT_ANALYSIS_LIMIT ? 'staged' : 'direct', 'partial', [])
      generated = this.fallbackContext(input, combined)
    }
    const missingSections = missingFromText(generated.markdown)
    return { ...generated, completeness: Math.max(0, 100 - missingSections.length * 20), missingSections }
  }

  private async readUrlSource(rawUrl: string, previous?: ProfileSource): Promise<ProfileSource> {
    const parsed = new URL(rawUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('공개 HTTP(S) URL만 사용할 수 있습니다.')
    const createdAt = previous?.createdAt ?? new Date().toISOString()
    try {
      const page = await this.urlReader.read(parsed.toString())
      return {
        id: previous?.id ?? crypto.randomUUID(), kind: 'url', title: page.title,
        location: page.finalUrl, extractedText: page.text, extractionError: null, createdAt
      }
    } catch (error) {
      return {
        id: previous?.id ?? crypto.randomUUID(), kind: 'url', title: previous?.title ?? parsed.hostname,
        location: parsed.toString(), extractedText: previous?.extractedText ?? '',
        extractionError: error instanceof Error ? error.message : String(error), createdAt
      }
    }
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    const id = crypto.randomUUID()
    const folder = join(this.db.root, 'profiles', id)
    mkdirSync(folder, { recursive: true })
    try {
      const sources: ProfileSource[] = []
      for (const path of input.filePaths) {
        const stored = join(folder, `${crypto.randomUUID()}-${safeName(basename(path))}`)
        copyFileSync(path, stored)
        const extractedText = await this.extractFile(stored)
        sources.push({ id: crypto.randomUUID(), kind: 'file', title: basename(path), location: stored, extractedText, extractionError: null, createdAt: new Date().toISOString() })
      }
      sources.push(...await Promise.all(input.urls.filter(Boolean).map((url) => this.readUrlSource(url))))
      if (sources.length && !sources.some((source) => source.extractedText.trim())) {
        const failures = sources.map((source) => `${source.location}: ${source.extractionError ?? '읽을 수 있는 내용 없음'}`).join('\n')
        throw new Error(`제공된 자료에서 본문을 읽지 못했습니다.\n${failures}`)
      }
      const generated = await this.analyze(input, sources, folder)
      const timestamp = new Date().toISOString()
      writeFileSync(join(folder, 'context.md'), generated.markdown, 'utf8')
      return this.db.saveProfile({
        id, name: input.name, targetRole: input.targetRole, experienceLevel: input.experienceLevel,
        contextMarkdown: generated.markdown, completeness: Math.round(generated.completeness),
        missingSections: generated.missingSections, sources, createdAt: timestamp, updatedAt: timestamp
      })
    } catch (error) {
      rmSync(folder, { recursive: true, force: true })
      throw error
    }
  }

  async regenerate(id: string, provider: CreateProfileInput['provider']): Promise<Profile> {
    const profile = this.db.getProfile(id)
    if (!profile) throw new Error('프로필을 찾을 수 없습니다.')
    const sources = await Promise.all(profile.sources.map(async (source) => {
      if (source.kind === 'url') return this.readUrlSource(source.location, source)
      if (!existsSync(source.location)) return { ...source, extractionError: '복사된 원본 파일을 찾을 수 없습니다.' }
      try { return { ...source, extractedText: await this.extractFile(source.location), extractionError: null } }
      catch (error) { return { ...source, extractionError: error instanceof Error ? error.message : String(error) } }
    }))
    if (!sources.some((source) => source.extractedText.trim())) throw new Error('프로필 자료에서 읽을 수 있는 본문이 없습니다.')
    const generated = await this.analyze({ ...profile, provider }, sources, join(this.db.root, 'profiles', id))
    const updated = this.db.saveProfile({
      ...profile, contextMarkdown: generated.markdown, completeness: Math.round(generated.completeness),
      missingSections: generated.missingSections, sources, updatedAt: new Date().toISOString()
    })
    writeFileSync(join(this.db.root, 'profiles', id, 'context.md'), generated.markdown, 'utf8')
    return updated
  }

  updateContext(id: string, contextMarkdown: string): Profile {
    const profile = this.db.updateProfileContext(id, contextMarkdown)
    writeFileSync(join(this.db.root, 'profiles', id, 'context.md'), contextMarkdown, 'utf8')
    return profile
  }
}
