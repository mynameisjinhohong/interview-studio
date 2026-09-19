import { useCallback, useEffect, useRef, useState, type FormEvent, type JSX } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, BarChart3, Bot, Building2, Camera, Check, ChevronRight, Clock3,
  Download, FileText, Gauge, LoaderCircle, Mic, MonitorPlay, Pause, Play, Plus, RefreshCw,
  RotateCcw, Settings, ShieldCheck, Sparkles, Square, Trash2, UserRound, Volume2, X
} from 'lucide-react'
import type {
  AppSettings, CliProbeResult, DashboardData, FollowUpDecision, InterviewQuestion,
  InterviewSession, InterviewTurn, Profile, Provider, SessionConfig
} from '../../shared/contracts'
import { ANSWER_LIMIT_SECONDS, answerWarning } from '../../shared/interview-rules'
import { AudioSampleController, ExclusiveAudioPlayer } from '../../shared/audio-playback'
import interviewStudioLogo from './assets/interview-studio-logo.png'

const api = window.interviewStudio
const providerLabel: Record<Provider, string> = { codex: 'Codex CLI', claude: 'Claude CLI', gemini: 'Gemini CLI' }
const formatDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

function LoadingScreen(): JSX.Element {
  return <div className="loading-screen"><div className="brand-mark"><img src={interviewStudioLogo} alt="" /></div><LoaderCircle className="spin" /><p>Interview Studio를 준비하고 있습니다</p></div>
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="shell">
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-mark"><img src={interviewStudioLogo} alt="Interview Studio 로고" /></span><span>Interview<br /><strong>Studio</strong></span></Link>
      <nav>
        <NavLink to="/" end><BarChart3 /> 대시보드</NavLink>
        <NavLink to="/profiles"><UserRound /> 프로필</NavLink>
        <NavLink to="/new"><Plus /> 새 면접</NavLink>
        <NavLink to="/settings"><Settings /> 설정</NavLink>
      </nav>
      <div className="local-badge"><ShieldCheck /><span>로컬 전용<br /><small>영상·음성 외부 전송 없음</small></span></div>
    </aside>
    <main className="content">{children}</main>
  </div>
}

function Onboarding({ settings, onComplete }: { settings: AppSettings; onComplete: () => Promise<void> }): JSX.Element {
  const [accepted, setAccepted] = useState(settings.consentAccepted)
  const [selected, setSelected] = useState<Provider>(settings.defaultProvider)
  const [probes, setProbes] = useState<CliProbeResult[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const probe = async () => { setError(''); setProbes(await api.probeClis()) }
  useEffect(() => { void probe() }, [])
  const selectedProbe = probes.find((item) => item.provider === selected)
  const usable = !!selectedProbe?.installed && !selectedProbe.error && selectedProbe.authenticated !== false
  const submit = async () => {
    if (!accepted || !usable) return
    setBusy(true); setError('')
    try {
      await api.testCli(selected)
      await api.saveSettings({ consentAccepted: true, cliVerified: true, defaultProvider: selected })
      await onComplete()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }
  return <div className="onboarding">
    <div className="onboarding-copy"><div className="onboarding-logo"><img src={interviewStudioLogo} alt="Interview Studio 로고" /><strong>Interview Studio</strong></div><div className="eyebrow">WELCOME TO</div><h1>면접의 긴장까지<br /><em>연습</em>하세요.</h1><p>내 포트폴리오를 이해하는 AI 면접관과 목소리로 대화하고, 답변과 영상을 한 번에 복기합니다.</p>
      <div className="feature-row"><span><Mic /> 음성 면접</span><span><Bot /> 동적 꼬리질문</span><span><MonitorPlay /> 로컬 녹화</span></div>
    </div>
    <div className="consent-card"><h2>AI 면접관 연결</h2><p>컨텍스트 수집 전에 기기에 설치된 AI CLI를 실제 호출해 연결을 확인합니다.</p>
      <ul><li>프로필 요약과 답변 전사는 선택한 CLI를 통해 해당 LLM 공급자에게 전달됩니다.</li><li>원본 파일 바이트·음성·카메라 영상은 보내지 않으며, 문서에서 추출한 텍스트는 컨텍스트 생성을 위해 전달됩니다.</li><li>모든 앱 데이터는 이 기기에 평문으로 저장됩니다.</li></ul>
      <label className="check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span><Check /></span> 위 내용을 이해하고 동의합니다.</label>
      <div className="probe-list onboarding-probes">{(['codex', 'claude', 'gemini'] as Provider[]).map((provider) => { const item = probes.find((probeResult) => probeResult.provider === provider); const ready = !!item?.installed && !item.error && item.authenticated !== false; const detail = !item ? '확인 중…' : !item.installed ? '설치되지 않음' : item.error ? item.error : item.authenticated === false ? '로그인 필요' : `${item.version} · 연결 후보`; return <label key={provider} className={selected === provider ? 'active' : ''}><input type="radio" checked={selected === provider} onChange={() => setSelected(provider)} /><Bot /><span><strong>{providerLabel[provider]}</strong><small>{detail}</small></span><i className={ready ? 'ok' : ''}>{ready ? <Check /> : <X />}</i></label> })}</div>
      <button className="secondary wide" disabled={busy} onClick={probe}><RefreshCw /> CLI 다시 확인</button>
      {error && <p className="error"><AlertTriangle />{error}</p>}
      <button className="primary wide onboarding-start" disabled={!accepted || !usable || busy} onClick={submit}>{busy ? <><LoaderCircle className="spin" /> 실제 연결 테스트 중…</> : <>연결 테스트 및 시작 <ChevronRight /></>}</button>
    </div>
  </div>
}

function Dashboard({ data }: { data: DashboardData }): JSX.Element {
  const completed = data.sessions.filter((session) => session.status === 'completed')
  const scoreHistory = [...completed].reverse().slice(-10)
  const average = completed.length ? Math.round(completed.reduce((sum, session) => sum + (session.report?.totalScore ?? 0), 0) / completed.length) : 0
  return <div className="page">
    <header className="page-header"><div><div className="eyebrow">OVERVIEW</div><h1>오늘도 한 단계<br />더 단단하게.</h1></div><Link className="primary" to="/new"><Plus /> 새 면접 시작</Link></header>
    <section className="metrics"><div><span>완료 세션</span><strong>{completed.length}</strong><small>최근 기록 기준</small></div><div><span>평균 점수</span><strong>{average}<i>/100</i></strong><small>완료 세션만 반영</small></div><div><span>연습 프로필</span><strong>{data.profiles.length}</strong><small>지원 직무별 컨텍스트</small></div></section>
    <div className="grid-two">
      <section><div className="section-title"><h2>최근 면접</h2><Link to="/new">새로 만들기</Link></div>
        <div className="session-list">{data.sessions.length ? data.sessions.map((session) => <Link to={['completed', 'partial'].includes(session.status) ? `/results/${session.id}` : `/interview/${session.id}`} className="session-card" key={session.id}>
          <div className={`session-icon ${session.effectiveType}`} >{session.effectiveType === 'company' ? <Building2 /> : <Bot />}</div>
          <div><strong>{session.title}</strong><span>{session.config.mode === 'practice' ? '연습' : '실전'} · {providerLabel[session.config.provider]} · {formatDate(session.createdAt)}</span></div>
          <div className={`status ${session.status}`}>{session.status === 'completed' ? `${session.report?.totalScore ?? 0}점` : session.status === 'partial' ? '중도 종료' : '진행 중'}</div><ChevronRight />
        </Link>) : <EmptyState title="아직 면접 기록이 없습니다" body="첫 기술 면접을 만들어 음성으로 답해보세요." action="첫 면접 만들기" to="/new" />}</div>
      </section>
      <section><div className="section-title"><h2>약점 큐</h2><span>낮은 점수순</span></div>
        <div className="weakness-list">{data.aggregate.length ? data.aggregate.slice(0, 6).map((item) => <div key={item.topic}><Link to={`/new?focus=${encodeURIComponent(item.topic)}`}>{item.topic}</Link><div className="bar"><i style={{ width: `${item.averageScore}%` }} /></div><strong>{item.averageScore}</strong></div>) : <div className="empty-mini"><Gauge /><p>면접을 완료하면<br />주제별 약점이 표시됩니다.</p></div>}</div>
      </section>
    </div>
    <section className="trend-card"><div className="section-title"><h2>점수 추이</h2><span>완료 세션만 반영</span></div>{scoreHistory.length ? <div className="trend-bars">{scoreHistory.map((session) => <Link to={`/results/${session.id}`} key={session.id} title={session.title}><i style={{ height: `${session.report?.totalScore ?? 0}%` }} /><strong>{session.report?.totalScore ?? 0}</strong><small>{formatDate(session.createdAt)}</small></Link>)}</div> : <div className="empty-mini"><BarChart3 /><p>완료한 면접의 점수 변화가 여기에 표시됩니다.</p></div>}</section>
  </div>
}

function EmptyState({ title, body, action, to }: { title: string; body: string; action: string; to: string }): JSX.Element {
  return <div className="empty-state"><Sparkles /><h3>{title}</h3><p>{body}</p><Link className="secondary" to={to}>{action}</Link></div>
}

function Profiles({ data, refresh }: { data: DashboardData; refresh: () => Promise<void> }): JSX.Element {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  return <div className="page"><header className="compact-header"><div><div className="eyebrow">CONTEXT LIBRARY</div><h1>지원 프로필</h1><p>직무별 경력과 프로젝트를 분리하면 질문이 더 정확해집니다.</p></div><button className="primary" onClick={() => setCreating(true)}><Plus /> 프로필 추가</button></header>
    <div className="profile-grid">{data.profiles.map((profile) => <article className="profile-card" key={profile.id}>
      <div className="profile-top"><div className="avatar">{profile.name.slice(0, 1)}</div><div><h3>{profile.name}</h3><p>{profile.targetRole} · {profile.experienceLevel}</p></div><button className="icon-button danger" onClick={async () => { if (confirm('프로필과 복사된 원본 자료를 삭제할까요?')) { await api.deleteProfile(profile.id); await refresh() } }}><Trash2 /></button></div>
      <div className="quality"><span>컨텍스트 완성도</span><strong className={profile.completeness < 60 ? 'warn-text' : ''}>{profile.completeness}%</strong><div><i style={{ width: `${profile.completeness}%` }} /></div></div>
      {profile.completeness < 60 && <p className="warning"><AlertTriangle /> 부족: {profile.missingSections.join(', ')}</p>}
      <div className="source-count"><FileText /> 자료 {profile.sources.length}개 · 성공 {profile.sources.filter((source) => !source.extractionError).length}개{profile.sources.some((source) => source.extractionError) && <span className="source-error"> · 실패 {profile.sources.filter((source) => source.extractionError).length}개</span>}</div><button className="secondary wide" onClick={() => setEditing(profile)}>컨텍스트와 수집 결과</button>
    </article>)}</div>
    {!data.profiles.length && <EmptyState title="첫 프로필을 만드세요" body="이력서와 포트폴리오를 올리면 면접관이 경력을 이해합니다." action="프로필 추가" to="#" />}
    {creating && <ProfileModal provider={data.settings.defaultProvider} close={() => setCreating(false)} done={async () => { setCreating(false); await refresh() }} />}
    {editing && <ContextModal profile={editing} provider={data.settings.defaultProvider} close={() => setEditing(null)} done={async () => { setEditing(null); await refresh() }} />}
  </div>
}

function ProfileModal({ provider, close, done }: { provider: Provider; close: () => void; done: () => Promise<void> }): JSX.Element {
  const [files, setFiles] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      await api.createProfile({ name: String(form.get('name')), targetRole: String(form.get('role')), experienceLevel: String(form.get('level')), filePaths: files, urls: String(form.get('urls')).split('\n').map((item) => item.trim()).filter(Boolean), provider, manualContext: String(form.get('manualContext') ?? '') })
      await done()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) }
  }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><button type="button" className="modal-close" onClick={close}><X /></button><div className="eyebrow">NEW CONTEXT</div><h2>새 지원 프로필</h2><p>자료가 다양할수록 맞춤 질문의 깊이가 높아집니다.</p>
    <label>이름<input required name="name" placeholder="홍길동" /></label><div className="form-row"><label>목표 직무<input required name="role" placeholder="게임 클라이언트 개발자" /></label><label>경력 수준<select name="level"><option>신입</option><option>1~3년</option><option>4~7년</option><option>8년 이상</option></select></label></div>
    <label>이력서·포트폴리오<button type="button" className="drop-zone" onClick={async () => setFiles(await api.selectProfileFiles())}><Download />{files.length ? `${files.length}개 파일 선택됨` : 'PDF, DOCX, TXT, 이미지 선택'}</button></label>
    <label>공개 URL <small>한 줄에 하나 · 직접 추출 실패 시 {providerLabel[provider]} 웹 수집으로 재시도</small><textarea name="urls" rows={3} placeholder="https://github.com/..." /></label>
    <label>직접 보완 설명 <small>Notion을 읽지 못하면 본문을 붙여 넣거나 핵심 역할·성과를 적어주세요.</small><textarea name="manualContext" rows={5} placeholder="프로젝트에서 맡은 역할, 사용 기술, 수치 성과, 해결한 문제…" /></label>
    {error && <p className="error"><AlertTriangle />{error}</p>}<button className="primary wide" disabled={busy}>{busy ? <><LoaderCircle className="spin" /> 자료 분석 중…</> : '프로필 생성'}</button>
  </form></div>
}

function ContextModal({ profile, provider, close, done }: { profile: Profile; provider: Provider; close: () => void; done: () => Promise<void> }): JSX.Element {
  const [context, setContext] = useState(profile.contextMarkdown), [supplement, setSupplement] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const methodLabel = { file: '파일 추출', 'direct-url': '직접 URL 추출', 'llm-web': 'LLM 웹 수집', manual: '직접 설명' } as const
  return <div className="modal-backdrop"><div className="modal large"><button className="modal-close" onClick={close}><X /></button><div className="eyebrow">GENERATED CONTEXT</div><h2>{profile.name}의 면접 컨텍스트</h2><p>면접마다 선택한 CLI에 전달되는 정리 파일입니다.</p>
    <section className="context-sources"><h3>자료 수집 결과</h3>{profile.sources.map((source) => <div className={source.extractionError ? 'failed' : 'collected'} key={source.id}>{source.extractionError ? <X /> : <Check />}<span><strong>{source.title}</strong><small>{methodLabel[source.collectionMethod ?? (source.kind === 'file' ? 'file' : source.kind === 'manual' ? 'manual' : 'direct-url')]} · {source.extractedText.length.toLocaleString()}자</small><em>{source.extractionError ?? source.collectionWarning ?? source.location}</em></span></div>)}</section>
    {!!profile.followUpQuestions?.length && <section className="follow-up-box"><h3>LLM이 확인하고 싶은 정보</h3><ul>{profile.followUpQuestions.map((question) => <li key={question}>{question}</li>)}</ul><textarea rows={5} value={supplement} onChange={(event) => setSupplement(event.target.value)} placeholder="질문에 대한 답변을 자유롭게 입력하세요. 답변은 로컬 원본으로 보존되고 컨텍스트에 다시 반영됩니다." /><button className="secondary wide" disabled={busy || !supplement.trim()} onClick={async () => { setBusy(true); setError(''); try { await api.supplementProfile(profile.id, provider, supplement); await done() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) } }}><Sparkles /> 보완 답변을 LLM에 반영</button></section>}
    <textarea className="context-editor" value={context} onChange={(event) => setContext(event.target.value)} />
    {error && <p className="error"><AlertTriangle />{error}</p>}<div className="button-row"><button className="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api.regenerateProfile(profile.id, provider); await done() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) } }}>{busy ? <><LoaderCircle className="spin" /> 수집·재생성 중…</> : '원본과 URL 다시 수집'}</button><button className="primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await api.updateProfileContext(profile.id, context); await done() } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false) } }}>수정 내용 저장</button></div></div></div>
}

function NewSession({ data, refresh }: { data: DashboardData; refresh: () => Promise<void> }): JSX.Element {
  const navigate = useNavigate(), [searchParams] = useSearchParams(), [type, setType] = useState<'technical' | 'company'>('technical')
  const [jobPostText, setJobPostText] = useState(''), [jobPostName, setJobPostName] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0), [cancelling, setCancelling] = useState(false)
  const preparationRequest = useRef<string | null>(null)
  useEffect(() => {
    if (!busy) { setElapsed(0); return }
    const startedAt = Date.now()
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1_000))
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [busy])
  useEffect(() => () => {
    const requestId = preparationRequest.current
    if (requestId) void api.cancelSessionPreparation(requestId)
  }, [])
  if (!data.profiles.length) return <div className="page"><EmptyState title="프로필이 먼저 필요합니다" body="면접관에게 전달할 경력 컨텍스트를 만들어 주세요." action="프로필 만들기" to="/profiles" /></div>
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget)
    const list = (name: string) => String(form.get(name) ?? '').split(',').map((item) => item.trim()).filter(Boolean)
    const config: SessionConfig = {
      profileId: String(form.get('profileId')), type, mode: String(form.get('mode')) as 'practice' | 'real',
      provider: String(form.get('provider')) as Provider, modelOverride: String(form.get('modelOverride') ?? '') || undefined,
      questionCount: Number(form.get('questionCount')), stacks: list('stacks'), experienceLevel: String(form.get('level')),
      focusAreas: list('focus'), excludedAreas: list('exclude'), company: String(form.get('company') ?? ''), role: String(form.get('role') ?? ''),
      stage: String(form.get('stage') ?? ''), jobPostText: String(form.get('jobPostText') ?? ''), jobPostUrl: String(form.get('jobPostUrl') ?? ''),
      forceResearch: form.get('forceResearch') === 'on'
    }
    try {
      const retention = await api.retentionCandidate()
      if (retention && !confirm(`최근 세션은 10개만 보관합니다. 새 면접을 시작하면 가장 오래된 “${retention.deletedTitle}”의 영상·전사·평가·조사 자료가 삭제됩니다. 계속할까요?`)) { setBusy(false); return }
      const requestId = crypto.randomUUID()
      preparationRequest.current = requestId
      const session = await api.prepareSession(config, requestId)
      preparationRequest.current = null
      await refresh()
      if (session.status === 'partial') throw new Error(session.errorReason ?? '세션 준비에 실패했습니다.')
      navigate(`/interview/${session.id}`)
    } catch (reason) {
      preparationRequest.current = null
      setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); setCancelling(false)
    }
  }
  const cancelPreparation = async () => {
    const requestId = preparationRequest.current
    if (!requestId || cancelling) return
    setCancelling(true)
    try {
      const cancelled = await api.cancelSessionPreparation(requestId)
      if (!cancelled) { preparationRequest.current = null; setBusy(false); setCancelling(false) }
    } catch (reason) {
      setError(`취소 요청 실패: ${reason instanceof Error ? reason.message : String(reason)}`)
      setCancelling(false)
    }
  }
  return <div className="page"><header className="compact-header"><div><div className="eyebrow">CREATE SESSION</div><h1>새 면접 만들기</h1><p>면접관이 자료를 조사하고 질문 목록을 준비합니다.</p></div></header>
    <form className="session-form" onSubmit={submit}><section><h2>1. 면접 종류</h2><div className="choice-grid"><button type="button" className={type === 'technical' ? 'selected' : ''} onClick={() => setType('technical')}><Bot /><strong>기술 면접</strong><span>기술 스택과 집중 영역 중심</span></button><button type="button" className={type === 'company' ? 'selected' : ''} onClick={() => setType('company')}><Building2 /><strong>회사 면접</strong><span>회사·공고·전형 맞춤 조사</span></button></div></section>
      <section><h2>2. 기본 설정</h2><div className="form-grid"><label>지원 프로필<select name="profileId">{data.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.targetRole}</option>)}</select></label><label>진행 모드<select name="mode"><option value="practice">연습 · 즉시 피드백</option><option value="real">실전 · 종료 후 피드백</option></select></label><label>AI CLI<select name="provider" defaultValue={data.settings.defaultProvider}>{Object.entries(providerLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>본 질문 개수<input name="questionCount" type="number" min="3" max="10" defaultValue="5" /></label><label>경력 수준<select name="level"><option>신입</option><option>1~3년</option><option>4~7년</option><option>8년 이상</option></select></label><label>모델 override <small>선택</small><input name="modelOverride" placeholder="CLI 기본 모델 사용" /></label></div></section>
      <section><h2>3. 면접 범위</h2>{type === 'technical' ? <div className="form-grid"><label className="full">기술 스택 <small>쉼표로 구분</small><input required name="stacks" placeholder="Unity, C#, URP" /></label><label>집중 영역<input name="focus" defaultValue={searchParams.get('focus') ?? ''} placeholder="메모리 최적화, 아키텍처" /></label><label>제외 영역<input name="exclude" placeholder="네트워크" /></label></div> : <div className="form-grid"><label>회사<input required name="company" placeholder="넥슨" /></label><label>직무<input required name="role" placeholder="게임 클라이언트 개발" /></label><label>전형 단계<select name="stage"><option>1차 직무 면접</option><option>2차 면접</option><option>임원 면접</option><option>알 수 없음</option></select></label><label>채용 공고 URL<input name="jobPostUrl" type="url" placeholder="https://..." /></label><label className="full">채용 공고 파일<button type="button" className="drop-zone compact" onClick={async () => { const selected = await api.selectJobPostFile(); if (selected) { setJobPostText(selected.text); setJobPostName(selected.name) } }}><Download />{jobPostName || 'PDF, DOCX, TXT 또는 이미지 선택'}</button></label><label className="full">채용 공고 본문<textarea name="jobPostText" rows={5} value={jobPostText} onChange={(event) => setJobPostText(event.target.value)} placeholder="공고 내용을 붙여 넣으면 정확도가 높아집니다." /></label></div>}<label className="check inline-check"><input type="checkbox" name="forceResearch" /><span><Check /></span> 캐시를 무시하고 공개 자료를 새로 조사</label></section>
      {error && <p className="error"><AlertTriangle />{error}</p>}{busy ? <div className="preparation-status"><LoaderCircle className="spin" /><span><strong>웹 자료 조사와 질문 생성 중…</strong><small>{formatTime(elapsed)} 경과 · 완료될 때까지 계속 기다립니다.</small></span><button type="button" className="danger-button" disabled={cancelling} onClick={cancelPreparation}><Square />{cancelling ? '취소 중…' : '준비 취소'}</button></div> : <button className="primary prepare"><Sparkles /> 면접 준비하기</button>}
    </form>
  </div>
}

function InterviewRoom(): JSX.Element {
  const { id = '' } = useParams(), navigate = useNavigate()
  const [session, setSession] = useState<InterviewSession | null>(null), [deviceReady, setDeviceReady] = useState(false), [started, setStarted] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'asking' | 'listening' | 'analyzing' | 'paused'>('idle')
  const [baseIndex, setBaseIndex] = useState(0), [depth, setDepth] = useState(0), [followUp, setFollowUp] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(ANSWER_LIMIT_SECONDS), [revealed, setRevealed] = useState(false), [replayed, setReplayed] = useState(false)
  const [error, setError] = useState(''), [practiceReview, setPracticeReview] = useState<{ turn: InterviewTurn; decision: FollowUpDecision } | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null), streamRef = useRef<MediaStream | null>(null), recorderRef = useRef<MediaRecorder | null>(null)
  const answerRecorderRef = useRef<MediaRecorder | null>(null), answerChunksRef = useRef<Blob[]>([]), recordingSequence = useRef(0), answerStarted = useRef(Date.now()), audioUrlRef = useRef('')
  const pendingRecordingChunks = useRef(new Set<Promise<void>>()), retriedAnswers = useRef(new Set<string>())

  useEffect(() => {
    void api.getSession(id).then((item) => {
      if (!item) return
      if (['completed', 'partial'].includes(item.status)) { navigate(`/results/${item.id}`, { replace: true }); return }
      const lastTurn = item.turns.at(-1)
      if (lastTurn && item.questionPlan) {
        const questionIndex = item.questionPlan.questions.findIndex((question) => question.id === lastTurn.questionId)
        if (lastTurn.decisionAction === 'follow-up' && lastTurn.decisionQuestion) {
          setBaseIndex(Math.max(0, questionIndex)); setDepth(Math.min(4, lastTurn.depth + 1)); setFollowUp(lastTurn.decisionQuestion)
        } else if (questionIndex + 1 < item.questionPlan.questions.length) {
          setBaseIndex(questionIndex + 1); setDepth(0); setFollowUp(null)
        } else if (lastTurn.decisionAction === 'next') {
          void api.finalizeRecording(item.id).then(() => api.finishSession(item.id, '앱 중단 후 완료 문항 기준으로 복구')).then((finished) => navigate(`/results/${finished.id}`, { replace: true }))
          return
        }
      }
      setSession(item)
    })
  }, [id, navigate])
  useEffect(() => { if (started && videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; void videoRef.current.play() } }, [started])
  useEffect(() => {
    if (phase !== 'listening') return
    const timer = window.setInterval(() => setRemaining((value) => { if (value <= 1) { window.clearInterval(timer); void submitAnswer(true); return 0 } return value - 1 }), 1000)
    return () => window.clearInterval(timer)
  }, [phase])
  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()) }, [])

  const currentBase = session?.questionPlan?.questions[baseIndex]
  const currentQuestion: InterviewQuestion | null = currentBase ? { ...currentBase, question: followUp ?? currentBase.question } : null
  const currentAnswerKey = currentBase ? `${currentBase.id}:${depth}` : ''

  const setupDevices = async () => {
    setError('')
    try {
      let stream: MediaStream
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } }) }
      catch { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }) }
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setDeviceReady(true)
    } catch (reason) { setError(`마이크를 사용할 수 없습니다: ${reason instanceof Error ? reason.message : String(reason)}`) }
  }

  const startContinuousRecording = () => {
    if (!streamRef.current) return
    const mimeType = streamRef.current.getVideoTracks().length && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'audio/webm;codecs=opus'
    const recorder = new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 2_000_000 })
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return
      const sequence = recordingSequence.current++
      const pending = event.data.arrayBuffer().then((buffer) => api.appendRecordingChunk({ sessionId: id, bytes: new Uint8Array(buffer), mimeType, sequence }))
      pendingRecordingChunks.current.add(pending)
      void pending.finally(() => pendingRecordingChunks.current.delete(pending))
    }
    recorder.start(5_000); recorderRef.current = recorder
  }

  const startAnswerRecording = () => {
    if (!streamRef.current) return
    const audioStream = new MediaStream(streamRef.current.getAudioTracks())
    const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' })
    answerChunksRef.current = []; recorder.ondataavailable = (event) => { if (event.data.size) answerChunksRef.current.push(event.data) }
    recorder.start(1_000); answerRecorderRef.current = recorder; answerStarted.current = Date.now(); setRemaining(ANSWER_LIMIT_SECONDS); setPhase('listening')
  }

  const speak = async (questionText: string, isReplay = false) => {
    setPhase('asking'); setError('')
    try {
      if (!isReplay || !audioUrlRef.current) audioUrlRef.current = await api.renderSpeech(questionText)
      const audioContext = new AudioContext()
      const response = await fetch(audioUrlRef.current)
      if (!response.ok) throw new Error('질문 음성 파일을 열 수 없습니다.')
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer())
      const source = audioContext.createBufferSource()
      source.buffer = buffer; source.connect(audioContext.destination)
      await new Promise<void>((resolve) => { source.onended = () => resolve(); source.start() })
      await audioContext.close()
      if (isReplay) setPhase('listening'); else startAnswerRecording()
    } catch (reason) { setPhase('paused'); setError(`질문 음성 재생에 실패했습니다. 설정을 확인한 뒤 다시 시도하세요. (${reason instanceof Error ? reason.message : String(reason)})`) }
  }

  const begin = async () => { await api.startSession(id); setStarted(true); startContinuousRecording(); await speak(currentQuestion!.question, false) }

  const stopAnswerBlob = (): Promise<Blob> => new Promise((resolve) => {
    const recorder = answerRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return resolve(new Blob([], { type: 'audio/webm' }))
    recorder.onstop = () => resolve(new Blob(answerChunksRef.current, { type: 'audio/webm' })); recorder.stop()
  })

  const submitAnswer = useCallback(async (timedOut = false) => {
    if (!session || !currentQuestion || phase !== 'listening') return
    setPhase('analyzing')
    try {
      const blob = await stopAnswerBlob()
      const result = await api.completeTurn({
        sessionId: session.id, questionId: currentBase!.id, question: currentQuestion.question, topic: currentBase!.topic,
        depth, audioBytes: new Uint8Array(await blob.arrayBuffer()), startedAt: new Date(answerStarted.current).toISOString(),
        durationSeconds: (Date.now() - answerStarted.current) / 1000, timedOut, replayUsed: replayed, textRevealed: revealed
      })
      setSession(await api.getSession(id))
      if (session.config.mode === 'practice') setPracticeReview(result)
      else await advance(result.decision)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason)); await stopSession('음성 전사 또는 CLI 응답 실패')
    }
  }, [session, currentQuestion, currentBase, phase, depth, replayed, revealed, id])

  const advance = async (decision: FollowUpDecision) => {
    setReplayed(false); setRevealed(false); audioUrlRef.current = ''
    if (decision.action === 'follow-up' && decision.question && depth < 4) { setFollowUp(decision.question); setDepth((value) => value + 1); setPracticeReview(null); setTimeout(() => void speak(decision.question!, false), 80); return }
    if (!session?.questionPlan || baseIndex + 1 >= session.questionPlan.questions.length) { await stopSession(); return }
    const nextQuestion = session.questionPlan.questions[baseIndex + 1].question
    setBaseIndex((value) => value + 1); setDepth(0); setFollowUp(null); setPracticeReview(null); setTimeout(() => void speak(nextQuestion, false), 80)
  }

  const stopContinuous = async (): Promise<void> => {
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') await new Promise<void>((resolve) => { recorder.onstop = () => resolve(); recorder.stop() })
    await Promise.all([...pendingRecordingChunks.current])
  }
  const stopSession = async (reason?: string) => {
    setPhase('analyzing'); await stopContinuous(); await api.finalizeRecording(id)
    const completed = await api.finishSession(id, reason); streamRef.current?.getTracks().forEach((track) => track.stop()); navigate(`/results/${completed.id}`)
  }

  if (!session || !currentQuestion) return <LoadingScreen />
  if (!started) return <div className="interview-screen device-screen"><Link to="/new" className="back"><ArrowLeft /> 돌아가기</Link><div className="device-card"><div className="eyebrow">DEVICE CHECK</div><h1>면접 환경을 확인하세요</h1><p>마이크는 필수이며 카메라는 사용할 수 없으면 음성만으로 진행됩니다. 헤드폰을 권장합니다.</p><div className="camera-preview"><video ref={videoRef} muted playsInline /><Camera /></div>{error && <p className="error"><AlertTriangle />{error}</p>}{!deviceReady ? <button className="primary wide" onClick={setupDevices}><Mic /> 마이크·카메라 확인</button> : <button className="primary wide" onClick={begin}>면접 시작</button>}</div></div>

  return <div className="interview-screen"><div className="interview-top"><div><span className="live-dot" /> {session.config.mode === 'practice' ? '연습 면접' : '실전 면접'}</div><div>주제 {baseIndex + 1} / {session.questionPlan?.questions.length}<span className="divider" />꼬리 {depth} / 4</div><button onClick={() => void stopSession('사용자 중도 종료')}><Square /> 종료</button></div>
    <div className="interview-stage"><div className={`ai-avatar ${phase}`}><div className="halo" /><div className="face"><i className="eye left" /><i className="eye right" /><i className="mouth" /></div><div className="sound-waves"><i /><i /><i /><i /><i /></div></div><h2>{phase === 'asking' ? '질문하고 있습니다' : phase === 'listening' ? '답변을 듣고 있습니다' : phase === 'analyzing' ? '답변을 분석하고 있습니다' : '면접이 잠시 멈췄습니다'}</h2>
      {revealed && <p className="question-text">{currentQuestion.question}</p>}
      {phase === 'listening' && <div className={`timer ${answerWarning(remaining) === 'ten-seconds' ? 'critical-time' : answerWarning(remaining) === 'one-minute' ? 'warning-time' : ''}`}><Clock3 /> {formatTime(remaining)}{answerWarning(remaining) !== 'none' && <small>{answerWarning(remaining) === 'ten-seconds' ? '곧 자동 제출됩니다' : '1분 이내에 마무리하세요'}</small>}</div>}
      {error && <p className="error stage-error"><AlertTriangle />{error}</p>}
    </div>
    <video className="self-view" ref={videoRef} muted playsInline />
    <div className="interview-controls"><button disabled={revealed || phase === 'analyzing'} onClick={() => setRevealed(true)}><FileText /> 질문 보기</button><button disabled={replayed || phase !== 'listening'} onClick={async () => { setReplayed(true); await speak(currentQuestion.question, true) }}><Volume2 /> 다시 듣기</button>{session.config.mode === 'practice' && <button disabled={phase === 'analyzing'} onClick={() => { const recorder = answerRecorderRef.current; if (phase === 'paused') { recorder?.resume(); setPhase('listening') } else { recorder?.pause(); setPhase('paused') } }}>{phase === 'paused' ? <Play /> : <Pause />} {phase === 'paused' ? '계속' : '일시정지'}</button>}<button className="finish-answer" disabled={phase !== 'listening'} onClick={() => void submitAnswer(false)}><Square /> 답변 완료</button></div>
    {practiceReview && <PracticeReview review={practiceReview} canRetry={!retriedAnswers.current.has(currentAnswerKey)} onContinue={async (transcript) => { if (transcript !== practiceReview.turn.transcript) await api.updateTranscript(practiceReview.turn.id, transcript); await advance(practiceReview.decision) }} onRetry={async () => { retriedAnswers.current.add(currentAnswerKey); setPracticeReview(null); audioUrlRef.current = ''; await speak(currentQuestion.question, false) }} />}
  </div>
}

function PracticeReview({ review, canRetry, onContinue, onRetry }: { review: { turn: InterviewTurn; decision: FollowUpDecision }; canRetry: boolean; onContinue: (transcript: string) => Promise<void>; onRetry: () => Promise<void> }): JSX.Element {
  const [transcript, setTranscript] = useState(review.turn.transcript), [busy, setBusy] = useState(false)
  return <div className="modal-backdrop"><div className="modal review-modal"><div className="eyebrow">PRACTICE FEEDBACK</div><h2>방금 답변을 확인하세요</h2><label>음성 전사<textarea rows={7} value={transcript} onChange={(event) => setTranscript(event.target.value)} /></label><div className="feedback"><Sparkles /><p>{review.decision.shortFeedback || '답변이 기록되었습니다.'}</p></div><div className="button-row">{canRetry && <button className="secondary" onClick={async () => { setBusy(true); await onRetry() }}><RotateCcw /> 한 번 다시 답변</button>}<button className="primary" disabled={busy} onClick={async () => { setBusy(true); await onContinue(transcript) }}>다음 단계 <ChevronRight /></button></div></div></div>
}

function Results({ refresh }: { refresh: () => Promise<void> }): JSX.Element {
  const { id = '' } = useParams(), [session, setSession] = useState<InterviewSession | null>(null), [mediaUrl, setMediaUrl] = useState(''), [editing, setEditing] = useState<InterviewTurn | null>(null)
  const resultVideoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => { api.getSession(id).then(async (item) => { setSession(item); if (item?.recordingPath) setMediaUrl(await api.getMediaUrl(item.recordingPath)) }) }, [id])
  if (!session) return <LoadingScreen />
  const report = session.report
  return <div className="page result-page"><header className="result-header"><div><div className="eyebrow">INTERVIEW REPORT</div><h1>{session.title}</h1><p>{session.status === 'partial' ? `중도 종료 · ${session.errorReason ?? ''}` : `${session.config.mode === 'practice' ? '연습' : '실전'} 면접 완료`}</p></div><div className="score-ring" style={{ '--score': report?.totalScore ?? 0 } as React.CSSProperties}><strong>{report?.totalScore ?? 0}</strong><span>/100</span></div></header>
    {session.errorReason && <p className="warning"><AlertTriangle /> {session.errorReason}</p>}
    <div className="result-actions"><Link className="secondary" to="/"><ArrowLeft /> 대시보드</Link><button className="secondary" onClick={() => void api.exportPdf(id)}><FileText /> PDF 보고서</button><button className="secondary" disabled={!session.recordingPath} onClick={() => void api.exportVideo(id)}><Download /> MP4 영상</button></div>
    <section className="summary-card"><Sparkles /><div><h2>종합 피드백</h2><p>{report?.summary ?? '완료된 답변이 없어 종합 평가를 만들 수 없습니다.'}</p></div></section>
    <div className="result-grid"><section><div className="section-title"><h2>문항별 복기</h2><span>{session.questionPlan?.questions.length ?? 0}개 주제</span></div><div className="topic-results">{session.questionPlan?.questions.map((question, index) => {
      const evaluation = report?.topics[index], turns = session.turns.filter((turn) => turn.questionId === question.id)
      return <details key={question.id} open={index === 0}><summary><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{question.topic}</strong><p>{question.question}</p></div><b>{evaluation?.score ?? 0}</b></summary><div className="detail-body">{turns.map((turn) => <div className="turn-result" key={turn.id}><small>{turn.depth ? `꼬리 질문 ${turn.depth}` : '본 질문'} · {Math.round(turn.durationSeconds)}초</small><h4>{turn.question}</h4><p>{turn.transcript || '(무응답)'}</p><button onClick={() => setEditing(turn)}>전사 수정·재평가</button></div>)}<div className="feedback-columns"><div><h4>잘한 점</h4><ul>{evaluation?.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h4>개선할 점</h4><ul>{evaluation?.improvements.map((item) => <li key={item}>{item}</li>)}</ul></div></div><div className="ideal"><h4>개선 답변 방향</h4><p>{evaluation?.improvedAnswer}</p></div></div></details>
    })}</div></section><aside><div className="video-card"><div className="section-title"><h2>면접 영상</h2><span>로컬 파일</span></div>{mediaUrl ? <><video ref={resultVideoRef} controls src={mediaUrl} /><div className="video-timeline">{session.turns.map((turn, index) => { const origin = Date.parse(session.turns[0]?.startedAt ?? turn.startedAt); const seconds = Math.max(0, Math.round((Date.parse(turn.startedAt) - origin) / 1000)); return <button key={turn.id} onClick={() => { if (resultVideoRef.current) { resultVideoRef.current.currentTime = seconds; void resultVideoRef.current.play() } }}><span>{index + 1}</span>{formatTime(seconds)}</button> })}</div></> : <div className="video-empty"><Camera /><p>이 세션에는 영상이 없습니다.</p></div>}</div><div className="source-card"><h2>참고 출처</h2>{session.research?.sources.slice(0, 8).map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><span>{source.title}</span><small>{source.confidence} · {source.publishedAt ? source.publishedAt.slice(0, 10) : '게시일 미상'}</small></a>)}</div></aside></div>
    {editing && <TranscriptEdit turn={editing} close={() => setEditing(null)} save={async (text) => { setSession(await api.updateTranscript(editing.id, text)); setEditing(null); await refresh() }} />}
  </div>
}

function TranscriptEdit({ turn, close, save }: { turn: InterviewTurn; close: () => void; save: (text: string) => Promise<void> }): JSX.Element {
  const [text, setText] = useState(turn.transcript), [busy, setBusy] = useState(false)
  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={close}><X /></button><h2>전사 수정·재평가</h2><p>수정하면 기존 평가가 새 결과로 덮어써집니다.</p><textarea rows={10} value={text} onChange={(event) => setText(event.target.value)} /><button className="primary wide" disabled={busy} onClick={async () => { setBusy(true); await save(text) }}>{busy ? <LoaderCircle className="spin" /> : '수정하고 재평가'}</button></div></div>
}

function SettingsPage({ data, refresh }: { data: DashboardData; refresh: () => Promise<void> }): JSX.Element {
  const [probes, setProbes] = useState<CliProbeResult[]>([]), [voices, setVoices] = useState<Array<{ id: string; name: string; language: string }>>([]), [stt, setStt] = useState<{ binary: string | null; models: Record<string, boolean> } | null>(null), [busyModel, setBusyModel] = useState('')
  const [sampleError, setSampleError] = useState('')
  const sampleController = useRef<AudioSampleController | null>(null)
  if (!sampleController.current) {
    sampleController.current = new AudioSampleController(
      () => api.renderSpeech('안녕하세요. 지금부터 모의 면접을 시작하겠습니다.'),
      new ExclusiveAudioPlayer((url) => new Audio(url))
    )
  }
  useEffect(() => {
    void Promise.all([api.probeClis().then(setProbes), api.listVoices().then(setVoices), api.getSttStatus().then(setStt)])
    return () => sampleController.current?.stop()
  }, [])
  const save = async (patch: Partial<AppSettings>) => { await api.saveSettings(patch); await refresh() }
  return <div className="page"><header className="compact-header"><div><div className="eyebrow">SYSTEM</div><h1>설정과 진단</h1><p>AI CLI, 음성, 로컬 모델과 데이터 상태를 관리합니다.</p></div></header>
    <div className="settings-grid"><section><h2>AI CLI</h2><p>인증과 모델 외 사용자 규칙·플러그인은 적용하지 않습니다.</p><div className="probe-list">{(['codex', 'claude', 'gemini'] as Provider[]).map((provider) => { const item = probes.find((probe) => probe.provider === provider); const usable = !!item?.installed && !item.error && item.authenticated !== false; const detail = !item ? '확인 중…' : !item.installed ? '설치되지 않음' : item.error ? item.error : item.authenticated === false ? '인증 필요' : `${item.version} · 사용 가능`; return <label key={provider} className={data.settings.defaultProvider === provider ? 'active' : ''}><input type="radio" name="provider" checked={data.settings.defaultProvider === provider} onChange={() => void save({ defaultProvider: provider })} /><Bot /><span><strong>{providerLabel[provider]}</strong><small>{detail}</small></span><i className={usable ? 'ok' : ''}>{usable ? <Check /> : <X />}</i></label> })}</div><button className="secondary" onClick={async () => setProbes(await api.probeClis())}><RefreshCw /> 다시 확인</button></section>
      <section><h2>면접관 음성</h2><label>한국어 음성<select value={data.settings.ttsVoice} onChange={(event) => void save({ ttsVoice: event.target.value })}><option value="">운영체제 기본값</option>{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.language}</option>)}</select></label><label>말하기 속도<input type="range" min="0.7" max="1.4" step="0.1" value={data.settings.ttsRate} onChange={(event) => void save({ ttsRate: Number(event.target.value) })} /><span>{data.settings.ttsRate}×</span></label><button className="secondary" onClick={async () => { setSampleError(''); try { await sampleController.current?.replay() } catch (reason) { setSampleError(reason instanceof Error ? reason.message : String(reason)) } }}><Volume2 /> 음성 샘플</button>{sampleError && <p className="error"><AlertTriangle />음성 샘플 재생 실패: {sampleError}</p>}</section>
      <section><h2>로컬 음성 인식</h2><p>실행 파일: {stt?.binary ?? 'whisper-cli를 찾지 못했습니다'}</p><div className="model-list">{(['base', 'small', 'medium'] as const).map((model) => <div key={model}><span><strong>{model}</strong><small>{model === 'base' ? '빠름' : model === 'small' ? '권장 균형' : '고정확도'}</small></span>{stt?.models[model] ? <b><Check /> 설치됨</b> : <button disabled={!!busyModel} onClick={async () => { setBusyModel(model); await api.downloadSttModel(model); setStt(await api.getSttStatus()); setBusyModel('') }}>{busyModel === model ? <LoaderCircle className="spin" /> : <Download />} 다운로드</button>}</div>)}</div><label>기본 모델<select value={data.settings.sttModel} onChange={(event) => void save({ sttModel: event.target.value as AppSettings['sttModel'] })}><option>base</option><option>small</option><option>medium</option></select></label></section>
      <section className="danger-zone"><h2>로컬 데이터</h2><p>프로필, 원본 복사본, 세션, 영상, 모델과 집계 통계를 모두 삭제합니다. 복구할 수 없습니다.</p><button className="danger-button" onClick={async () => { if (confirm('Interview Studio의 모든 로컬 데이터를 영구 삭제할까요?')) { await api.deleteAllData(); await refresh() } }}><Trash2 /> 모든 데이터 삭제</button></section></div>
  </div>
}

export function App(): JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null)
  const refresh = useCallback(async () => setData(await api.bootstrap()), [])
  useEffect(() => { void refresh() }, [refresh])
  if (!data) return <LoadingScreen />
  if (!data.settings.consentAccepted || !data.settings.cliVerified) return <Onboarding settings={data.settings} onComplete={refresh} />
  return <Routes><Route element={<Shell><RoutesOutlet /></Shell>}>
    <Route index element={<Dashboard data={data} />} />
    <Route path="profiles" element={<Profiles data={data} refresh={refresh} />} />
    <Route path="new" element={<NewSession data={data} refresh={refresh} />} />
    <Route path="results/:id" element={<Results refresh={refresh} />} />
    <Route path="settings" element={<SettingsPage data={data} refresh={refresh} />} />
  </Route><Route path="interview/:id" element={<InterviewRoom />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>
}

function RoutesOutlet(): JSX.Element { return <Outlet /> }
