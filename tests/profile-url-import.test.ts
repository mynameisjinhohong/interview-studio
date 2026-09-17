import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../src/main/database.js'
import type { CliRegistry } from '../src/main/services/cli-adapters.js'
import { ProfileService, splitProfileText } from '../src/main/services/profile-service.js'
import { htmlToReadableText, isPublicIp, PublicUrlReader } from '../src/main/services/url-content-service.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

describe('profile URL import', () => {
  it.skipIf(process.env.LIVE_PROFILE_URL !== '1')('reads the reported hongjinho.dev portfolio end to end', async () => {
    const page = await new PublicUrlReader().read('https://hongjinho.dev/')
    expect(page.title).toContain('홍진호')
    expect(page.text.length).toBeGreaterThan(7_000)
    expect(page.text).toContain('강한 토끼만이 살아남는다')
    expect(page.text).toContain('Jenkins CI/CD')
    expect(page.text).toContain('Invant')
  }, 30_000)

  it('keeps visible portfolio content while removing Next.js hydration scripts', () => {
    const html = '<html><head><title>홍진호 | 포트폴리오</title><script>self.__next_f.push(["잘못된 명령"])</script></head><body><main><h1>Unity 개발자</h1><p>Jenkins CI/CD 구축 경험</p><img alt="게임 플레이 화면" /></main></body></html>'
    const extracted = htmlToReadableText(html)
    expect(extracted.title).toBe('홍진호 | 포트폴리오')
    expect(extracted.text).toContain('Unity 개발자')
    expect(extracted.text).toContain('Jenkins CI/CD 구축 경험')
    expect(extracted.text).toContain('게임 플레이 화면')
    expect(extracted.text).not.toContain('잘못된 명령')
  })

  it('splits oversized source text without exceeding the per-chunk limit', () => {
    const text = `${'가'.repeat(20_000)}\n${'나'.repeat(20_000)}`
    const chunks = splitProfileText(text, 18_000)
    expect(chunks.length).toBe(4)
    expect(chunks.every((chunk) => chunk.length <= 18_000)).toBe(true)
    expect(chunks.join('')).toBe(text.replace('\n', ''))
  })

  it('rejects local and private network destinations before fetching', async () => {
    const fetcher = vi.fn()
    const reader = new PublicUrlReader(fetcher, async () => [{ address: '127.0.0.1' }])
    await expect(reader.read('https://internal.example/')).rejects.toThrow('공개 인터넷 주소')
    expect(fetcher).not.toHaveBeenCalled()
    expect(isPublicIp('192.168.0.2')).toBe(false)
    expect(isPublicIp('8.8.8.8')).toBe(true)
  })

  it('fetches explicit URL content and sends the extracted portfolio text to the CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-profile-url-'))
    roots.push(root)
    let cliInput: unknown
    const adapter = {
      invokeStructured: vi.fn(async (_task: string, input: unknown, _schema?: unknown, _validator?: unknown, _options?: unknown) => {
        cliInput = input
        return {
          markdown: '# 홍진호\n\n## 경력과 역할\nUnity 개발자\n## 기술 스택\nC#\n## 프로젝트\n강한 토끼만이 살아남는다\n## 성과\n출시 성과\n## 문제 해결 사례\nJenkins CI/CD로 빌드 문제 해결',
          completeness: 1,
          missingSections: []
        }
      })
    }
    const db = { root, saveProfile: (profile: unknown) => profile } as unknown as AppDatabase
    const cli = { get: () => adapter } as unknown as CliRegistry
    const urlReader = {
      read: vi.fn(async () => ({
        title: '홍진호 | 게임 개발자 포트폴리오',
        finalUrl: 'https://hongjinho.dev/',
        text: 'Unity와 C#을 중심으로 게임을 개발했습니다. 강한 토끼만이 살아남는다. Jenkins CI/CD 구축 경험.'
      }))
    }

    // The third dependency is the URL reader seam exercised by this regression test.
    const service = new ProfileService(db, cli, urlReader as never)
    const profile = await service.create({
      name: '홍진호', targetRole: '게임 클라이언트 개발자', experienceLevel: '1~3년',
      filePaths: [], urls: ['https://hongjinho.dev/'], provider: 'codex'
    })

    expect(urlReader.read).toHaveBeenCalledWith('https://hongjinho.dev/')
    expect(profile.sources[0].title).toBe('홍진호 | 게임 개발자 포트폴리오')
    expect(profile.sources[0].extractedText).toContain('Jenkins CI/CD')
    expect(profile.completeness).toBe(100)
    expect(cliInput).toMatchObject({
      documents: expect.stringContaining('강한 토끼만이 살아남는다')
    })
    expect(adapter.invokeStructured.mock.calls[0]?.[4]).toMatchObject({
      idleTimeoutMs: 90_000, retries: 0
    })
  })

  it('reports a URL extraction failure instead of saving an empty context', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-profile-url-'))
    roots.push(root)
    const adapter = { invokeStructured: vi.fn() }
    const db = { root, saveProfile: (profile: unknown) => profile } as unknown as AppDatabase
    const cli = { get: () => adapter } as unknown as CliRegistry
    const urlReader = { read: vi.fn(async () => { throw new Error('HTTP 403') }) }
    const service = new ProfileService(db, cli, urlReader)

    await expect(service.create({
      name: '홍진호', targetRole: '게임 클라이언트 개발자', experienceLevel: '1~3년',
      filePaths: [], urls: ['https://hongjinho.dev/'], provider: 'codex'
    })).rejects.toThrow('본문을 읽지 못했습니다')
    expect(adapter.invokeStructured).not.toHaveBeenCalled()
  })

  it('re-fetches an existing URL-only profile and replaces its empty source text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-profile-url-'))
    roots.push(root)
    const id = crypto.randomUUID()
    mkdirSync(join(root, 'profiles', id), { recursive: true })
    const profile = {
      id, name: '홍진호', targetRole: '게임 클라이언트 개발자', experienceLevel: '1~3년',
      contextMarkdown: '# 이전 빈 컨텍스트', completeness: 10, missingSections: ['프로젝트'],
      sources: [{ id: crypto.randomUUID(), kind: 'url' as const, title: 'hongjinho.dev', location: 'https://hongjinho.dev/', extractedText: '', createdAt: new Date().toISOString() }],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }
    const db = {
      root, getProfile: () => profile,
      saveProfile: vi.fn((next) => next)
    } as unknown as AppDatabase
    const adapter = { invokeStructured: vi.fn(async () => ({
      markdown: '## 경력과 역할\nUnity 개발자\n## 기술 스택\nC#\n## 프로젝트\n게임 출시\n## 성과\n수상\n## 문제 해결 사례\nCI/CD 문제 해결',
      completeness: 1, missingSections: []
    })) }
    const cli = { get: () => adapter } as unknown as CliRegistry
    const urlReader = { read: vi.fn(async () => ({ title: '홍진호 | 포트폴리오', finalUrl: 'https://hongjinho.dev/', text: 'Unity C# 프로젝트 출시 수상 문제 해결 경력 역할 기술 스택' })) }
    const service = new ProfileService(db, cli, urlReader)

    const regenerated = await service.regenerate(id, 'codex')

    expect(regenerated.sources[0].extractedText).toContain('Unity C#')
    expect(regenerated.contextMarkdown).toContain('CI/CD 문제 해결')
    expect(regenerated.completeness).toBe(100)
    expect(db.saveProfile).toHaveBeenCalledOnce()
  })

  it('summarizes large sources in chunks, checkpoints digests, then merges them', async () => {
    const root = mkdtempSync(join(tmpdir(), 'interview-profile-url-'))
    roots.push(root)
    let storedProfile: unknown
    const db = {
      root, saveProfile: (profile: unknown) => { storedProfile = profile; return profile },
      getProfile: () => storedProfile
    } as unknown as AppDatabase
    const adapter = {
      invokeStructured: vi.fn(async (task: string, input: unknown) => task.includes('자료 조각')
        ? { markdown: `요약 ${String((input as { chunkIndex: number }).chunkIndex)}: Unity 프로젝트 경력과 성과 및 문제 해결` }
        : {
            markdown: '## 경력과 역할\nUnity 개발자\n## 기술 스택\nC#\n## 프로젝트\n대형 프로젝트\n## 성과\n성능 개선\n## 문제 해결 사례\n빌드 장애 해결',
            completeness: 100, missingSections: []
          })
    }
    const cli = { get: () => adapter } as unknown as CliRegistry
    const longText = Array.from({ length: 4_000 }, (_, index) => `프로젝트 ${index}: Unity C# 구현, 성능 개선과 문제 해결 사례.`).join('\n')
    const urlReader = { read: vi.fn(async () => ({ title: '대형 포트폴리오', finalUrl: 'https://example.com/', text: longText })) }
    const service = new ProfileService(db, cli, urlReader)

    const profile = await service.create({
      name: '홍진호', targetRole: '게임 클라이언트 개발자', experienceLevel: '1~3년',
      filePaths: [], urls: ['https://example.com/'], provider: 'codex'
    })

    const checkpointPath = join(root, 'profiles', profile.id, 'source-digests.json')
    expect(adapter.invokeStructured.mock.calls.filter(([task]) => String(task).includes('자료 조각')).length).toBeGreaterThan(1)
    expect(adapter.invokeStructured.mock.calls.at(-1)?.[0]).toContain('최종 면접 컨텍스트')
    expect(existsSync(checkpointPath)).toBe(true)
    expect(JSON.parse(readFileSync(checkpointPath, 'utf8'))).toMatchObject({ status: 'completed' })

    const digestCalls = adapter.invokeStructured.mock.calls.filter(([task]) => String(task).includes('자료 조각')).length
    await service.regenerate(profile.id, 'codex')
    expect(adapter.invokeStructured.mock.calls.filter(([task]) => String(task).includes('자료 조각')).length).toBe(digestCalls)
  })
})
