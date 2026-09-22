import { _electron as electron } from '@playwright/test'
import Database from 'better-sqlite3'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = join(repoRoot, 'docs', 'images')
const dataRoot = mkdtempSync(join(tmpdir(), 'interview-studio-readme-'))
const now = '2026-09-21T11:30:00.000Z'
const completedSessionId = '11111111-1111-4111-8111-111111111111'
const readySessionId = '22222222-2222-4222-8222-222222222222'

const question = (id, category, topic, text) => ({
  id,
  category,
  topic,
  question: text,
  intent: `${topic}에 대한 이해와 설명 능력을 확인합니다.`,
  sourceUrls: [],
  suggestedFollowUps: []
})

const config = (overrides = {}) => ({
  profileId: 'demo-profile',
  type: 'company',
  mode: 'practice',
  provider: 'codex',
  questionCount: 3,
  stacks: ['Unity', 'C#', '자료구조', '운영체제'],
  experienceLevel: '1~3년',
  focusAreas: [],
  excludedAreas: [],
  company: '샘플 게임사',
  role: '게임 클라이언트 개발',
  stage: '1차 직무 면접 · CS/기본기 중심',
  jobPostText: '',
  jobPostUrl: '',
  forceResearch: false,
  ...overrides
})

const breakdown = (score) => ({
  relevance: Math.round(score * 0.25),
  evidence: Math.round(score * 0.25),
  depth: Math.round(score * 0.25),
  structure: Math.round(score * 0.15),
  concision: Math.max(0, score - Math.round(score * 0.25) * 3 - Math.round(score * 0.15))
})

const evaluation = (topic, score, strength, improvement, improvedAnswer) => ({
  topic,
  score,
  breakdown: breakdown(score),
  strengths: [strength],
  improvements: [improvement],
  improvedAnswer
})

const mainQuestions = [
  question('q-memory', 'cs', '메모리 관리', '스택과 힙의 차이를 설명하고, 게임 클라이언트에서 메모리 할당을 줄여야 하는 이유를 말씀해 주세요.'),
  question('q-frame', 'portfolio-cs', '프레임 최적화', '프로파일링으로 프레임 드롭의 원인을 찾고 해결했던 과정을 설명해 주세요.'),
  question('q-collaboration', 'portfolio', '협업과 문제 해결', '기획 요구사항과 기술적 제약이 충돌했을 때 어떻게 합의점을 찾았는지 말씀해 주세요.')
]

const mainReport = {
  totalScore: 86,
  summary: '핵심 개념을 실제 프로젝트 사례와 연결해 설명했고, 문제를 발견하고 검증한 과정이 명확했습니다. 수치 근거와 대안 비교를 조금 더 보강하면 한층 설득력 있는 답변이 됩니다.',
  strengths: ['개념과 실무 경험을 자연스럽게 연결함', '문제 해결 과정을 순서대로 설명함'],
  improvements: ['최적화 전후 지표를 수치로 제시하기', '선택하지 않은 대안과 판단 기준도 언급하기'],
  topics: [
    evaluation('메모리 관리', 89, '스택과 힙의 수명 차이를 정확히 구분했습니다.', 'GC 발생 조건과 측정 지표를 함께 설명해 보세요.', '메모리 영역의 차이를 정의한 뒤 Unity Profiler에서 할당량과 GC 스파이크를 확인하고, 풀링 적용 전후 수치를 비교해 설명합니다.'),
    evaluation('프레임 최적화', 87, '프로파일링부터 재측정까지의 흐름이 구체적이었습니다.', '병목 후보를 배제한 근거를 덧붙이세요.', 'CPU·GPU 병목을 먼저 분리하고, 프레임 디버거와 프로파일러로 원인을 좁힌 뒤 최적화 전후 프레임 시간을 수치로 제시합니다.'),
    evaluation('협업과 문제 해결', 82, '관계자의 목표를 먼저 확인한 점이 좋았습니다.', '합의 이후의 검증 결과를 더 구체화하세요.', '요구사항의 목적을 확인하고 기술 제약을 수치로 공유한 다음, 단계적 대안을 제안하고 플레이테스트 결과로 합의를 검증합니다.')
  ]
}

const research = {
  id: 'research-demo',
  kind: 'company',
  queryKey: 'sample-game-client',
  summary: '공식 채용 정보와 공개 기술 자료를 바탕으로 게임 클라이언트 직무의 기본기와 프로젝트 경험을 함께 확인합니다.',
  inferredStacks: ['Unity', 'C#', '자료구조', '운영체제'],
  sources: [
    { title: '공식 채용 페이지', url: 'https://example.com/careers', publishedAt: '2026-08-28T00:00:00.000Z', collectedAt: now, confidence: 'high', summary: '직무 역할과 필수 역량을 확인했습니다.' },
    { title: '게임 클라이언트 기술 블로그', url: 'https://example.com/tech', publishedAt: '2026-07-14T00:00:00.000Z', collectedAt: now, confidence: 'medium', summary: '클라이언트 최적화 사례와 개발 환경을 확인했습니다.' }
  ],
  sufficientForCompany: true,
  createdAt: now,
  expiresAt: '2026-09-28T11:30:00.000Z'
}

const createTurn = (id, questionId, topic, questionText, transcript, durationSeconds, depth = 0) => ({
  id,
  sessionId: completedSessionId,
  questionId,
  question: questionText,
  topic,
  depth,
  transcript,
  audioPath: null,
  startedAt: new Date(Date.parse(now) + Number(id.replace(/\D/g, '')) * 180_000).toISOString(),
  completedAt: new Date(Date.parse(now) + Number(id.replace(/\D/g, '')) * 180_000 + durationSeconds * 1_000).toISOString(),
  durationSeconds,
  timedOut: false,
  replayUsed: false,
  textRevealed: false,
  shortFeedback: '핵심 내용이 잘 전달되었습니다.',
  decisionAction: 'next',
  decisionQuestion: null
})

const seedDatabase = () => {
  mkdirSync(dataRoot, { recursive: true })
  const db = new Database(join(dataRoot, 'interview-studio.sqlite'))
  db.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, target_role TEXT NOT NULL, experience_level TEXT NOT NULL,
      context_markdown TEXT NOT NULL, completeness INTEGER NOT NULL, missing_sections_json TEXT NOT NULL,
      sources_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      follow_up_questions_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, config_json TEXT NOT NULL, effective_type TEXT NOT NULL,
      status TEXT NOT NULL, question_plan_json TEXT, research_json TEXT, report_json TEXT,
      recording_path TEXT, error_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    );
    CREATE TABLE turns (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE aggregate_stats (topic TEXT PRIMARY KEY, score_sum REAL NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE recording_markers (
      turn_id TEXT PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL, completed_at TEXT NOT NULL, duration_seconds REAL NOT NULL
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
    CREATE INDEX turns_session_idx ON turns(session_id, created_at);
  `)

  const settings = {
    consentAccepted: true,
    cliVerified: true,
    mediaSetupCompleted: true,
    defaultProvider: 'codex',
    modelOverrides: { codex: '', claude: '', gemini: '' },
    ttsVoice: 'demo-ko-voice',
    ttsRate: 0.9,
    ttsPitch: 0,
    sttModel: 'small'
  }
  const insertSetting = db.prepare('INSERT INTO settings(key,value_json) VALUES(?,?)')
  Object.entries(settings).forEach(([key, value]) => insertSetting.run(key, JSON.stringify(value)))

  const sources = [
    { id: 'source-resume', kind: 'file', title: '게임 클라이언트 개발자 이력서.pdf', location: '/sample/resume.pdf', extractedText: 'Unity와 C#을 활용한 게임 클라이언트 개발 경험', collectionMethod: 'file', createdAt: now },
    { id: 'source-portfolio', kind: 'url', title: '프로젝트 포트폴리오', location: 'https://portfolio.example.com', extractedText: '프로젝트 역할, 기술 선택, 최적화 성과', collectionMethod: 'direct-url', createdAt: now },
    { id: 'source-github', kind: 'url', title: '공개 GitHub 프로젝트', location: 'https://github.com/example', extractedText: '게임 플레이 시스템과 도구 코드', collectionMethod: 'llm-web', collectionWarning: '공개 페이지에서 확인 가능한 내용만 수집했습니다.', createdAt: now }
  ]
  db.prepare(`INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    'demo-profile', '김개발 (예시)', '게임 클라이언트 개발자', '1~3년',
    '# 프로필 요약\n\nUnity와 C# 기반 게임 클라이언트 개발자입니다.\n\n## 프로젝트\n- 전투 시스템과 UI 구조 설계\n- 프로파일링 기반 프레임 최적화\n\n## 성과\n- 평균 프레임 시간 24ms에서 15ms로 개선',
    92, '[]', JSON.stringify(sources), now, now, JSON.stringify(['최적화 전후 지표를 어떤 환경에서 측정했나요?'])
  )

  const insertSession = db.prepare(`INSERT INTO sessions(
    id,title,config_json,effective_type,status,question_plan_json,research_json,report_json,
    recording_path,error_reason,created_at,updated_at,completed_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  insertSession.run(
    completedSessionId, '게임 클라이언트 직무 면접 · 2026. 9. 21.', JSON.stringify(config()), 'company', 'completed',
    JSON.stringify({ title: '게임 클라이언트 직무 면접', questions: mainQuestions }), JSON.stringify(research), JSON.stringify(mainReport),
    null, null, '2026-09-21T11:30:00.000Z', '2026-09-21T12:05:00.000Z', '2026-09-21T12:05:00.000Z'
  )

  const history = [
    {
      id: '33333333-3333-4333-8333-333333333333', title: 'Unity 최적화 기술 면접 · 2026. 9. 18.', createdAt: '2026-09-18T10:00:00.000Z', score: 79,
      topics: [evaluation('렌더링 파이프라인', 75, '기본 흐름을 이해했습니다.', 'GPU 병목 측정 방법을 보강하세요.', '렌더링 단계와 측정 도구를 함께 설명합니다.'), evaluation('자료구조 선택', 83, '상황별 장단점을 비교했습니다.', '복잡도를 수치로 제시하세요.', '접근 패턴과 복잡도를 기준으로 비교합니다.')]
    },
    {
      id: '44444444-4444-4444-8444-444444444444', title: '게임 개발 CS 면접 · 2026. 9. 15.', createdAt: '2026-09-15T09:00:00.000Z', score: 73,
      topics: [evaluation('운영체제 동기화', 68, '용어를 구분했습니다.', '경쟁 상태 사례를 구체화하세요.', '공유 자원 예시와 동기화 비용을 설명합니다.'), evaluation('네트워크 기초', 78, 'TCP와 UDP 차이를 설명했습니다.', '게임 장르별 선택 기준을 보강하세요.', '지연과 신뢰성 요구를 기준으로 설명합니다.')]
    }
  ]
  history.forEach((item) => insertSession.run(
    item.id, item.title, JSON.stringify(config({ type: 'technical', company: '', role: '', stage: '', stacks: ['Unity', 'C#'] })),
    'technical', 'completed', JSON.stringify({ title: item.title, questions: mainQuestions }), null,
    JSON.stringify({ totalScore: item.score, summary: '이전 연습 면접 결과입니다.', strengths: [], improvements: [], topics: item.topics }),
    null, null, item.createdAt, item.createdAt, item.createdAt
  ))

  insertSession.run(
    readySessionId, '게임 클라이언트 CS 면접 · 준비됨', JSON.stringify(config({ type: 'technical', company: '', role: '', stage: '' })),
    'technical', 'ready', JSON.stringify({ title: '게임 클라이언트 CS 면접', questions: mainQuestions }), null, null,
    null, null, '2026-09-22T09:00:00.000Z', '2026-09-22T09:03:00.000Z', null
  )

  const turns = [
    createTurn('turn-1', 'q-memory', '메모리 관리', mainQuestions[0].question, '스택은 함수 호출과 함께 수명이 관리되고 접근이 빠릅니다. 힙은 동적으로 할당할 수 있지만 Unity에서는 잦은 할당이 GC 스파이크로 이어질 수 있어, Profiler로 할당 지점을 찾고 오브젝트 풀과 버퍼 재사용을 적용했습니다.', 108),
    createTurn('turn-2', 'q-frame', '프레임 최적화', mainQuestions[1].question, 'CPU와 GPU 프레임 시간을 먼저 비교해 CPU 병목임을 확인했습니다. 이후 Hierarchy 뷰에서 반복 생성되는 UI와 Update 호출을 찾았고, 캐싱과 이벤트 기반 갱신으로 바꾼 뒤 평균 프레임 시간을 24ms에서 15ms로 줄였습니다.', 132),
    createTurn('turn-3', 'q-collaboration', '협업과 문제 해결', mainQuestions[2].question, '기획 의도를 먼저 확인하고 현재 메모리 예산과 일정 제약을 공유했습니다. 전체 기능을 한 번에 넣는 대신 핵심 연출부터 적용한 뒤 플레이테스트 지표로 다음 범위를 결정하는 단계적 대안을 제안했습니다.', 96)
  ]
  const insertTurn = db.prepare('INSERT INTO turns(id,session_id,payload_json,created_at) VALUES(?,?,?,?)')
  turns.forEach((turn) => insertTurn.run(turn.id, turn.sessionId, JSON.stringify(turn), turn.completedAt))
  db.close()

  const runtimeBin = join(dataRoot, 'runtime', 'bin')
  mkdirSync(runtimeBin, { recursive: true })
  const whisper = join(runtimeBin, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli')
  writeFileSync(whisper, '#!/bin/sh\nexit 0\n')
  if (process.platform !== 'win32') chmodSync(whisper, 0o755)
  mkdirSync(join(dataRoot, 'models'), { recursive: true })
  writeFileSync(join(dataRoot, 'models', 'ggml-small.bin'), 'documentation fixture')
}

const capture = async () => {
  seedDatabase()
  mkdirSync(outputRoot, { recursive: true })
  const app = await electron.launch({
    args: [repoRoot, `--user-data-dir=${dataRoot}`],
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    timeout: 60_000
  })
  try {
    const page = await app.firstWindow({ timeout: 60_000 })
    await page.setViewportSize({ width: 1440, height: 920 })
    await page.waitForSelector('.shell')
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(outputRoot, 'dashboard.png') })

    await page.getByRole('link', { name: '프로필', exact: true }).click()
    await page.waitForSelector('.profile-card')
    await page.getByRole('button', { name: '컨텍스트와 수집 결과' }).click()
    await page.waitForSelector('.context-sources')
    await page.screenshot({ path: join(outputRoot, 'profile-context.png') })
    await page.locator('.modal-close').click()

    await page.getByRole('link', { name: '새 면접', exact: true }).click()
    await page.getByRole('button', { name: /회사 면접/ }).click()
    await page.getByLabel('회사', { exact: true }).fill('샘플 게임사')
    await page.getByLabel('직무', { exact: true }).fill('게임 클라이언트 개발')
    await page.getByLabel('채용 공고 URL').fill('https://example.com/careers/game-client')
    await page.locator('.session-form section').nth(2).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(outputRoot, 'company-session.png') })

    await page.evaluate((sessionId) => { window.location.hash = `#/interview/${sessionId}` }, readySessionId)
    await page.waitForSelector('.device-card')
    await page.screenshot({ path: join(outputRoot, 'device-check.png') })

    await page.evaluate((sessionId) => { window.location.hash = `#/results/${sessionId}` }, completedSessionId)
    await page.waitForSelector('.result-page')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: join(outputRoot, 'interview-report.png') })
  } finally {
    await app.close()
    rmSync(dataRoot, { recursive: true, force: true })
  }
}

await capture()
