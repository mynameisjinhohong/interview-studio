import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'
import type { InterviewSession } from '../shared/contracts.js'

const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

const reportHtml = (session: InterviewSession): string => {
  const report = session.report
  const questionRows = session.questionPlan?.questions.map((question, index) => {
    const turns = session.turns.filter((turn) => turn.questionId === question.id)
    const evaluation = report?.topics[index]
    return `<section><h2>${index + 1}. ${escape(question.topic)} <span>${evaluation?.score ?? 0}점</span></h2>
      <h3>${escape(question.question)}</h3>
      ${turns.map((turn) => `<div class="turn"><strong>${escape(turn.question)}</strong><p>${escape(turn.transcript || '(무응답)')}</p><small>${Math.round(turn.durationSeconds)}초 · ${turn.completedAt}</small></div>`).join('')}
      <h3>강점</h3><ul>${(evaluation?.strengths ?? []).map((item) => `<li>${escape(item)}</li>`).join('')}</ul>
      <h3>개선점</h3><ul>${(evaluation?.improvements ?? []).map((item) => `<li>${escape(item)}</li>`).join('')}</ul>
      <h3>개선 답변 방향</h3><p>${escape(evaluation?.improvedAnswer ?? '')}</p></section>`
  }).join('') ?? ''
  const sources = session.research?.sources.map((source) => `<li><a href="${escape(source.url)}">${escape(source.title)}</a> · 신뢰도 ${source.confidence} · 게시일 ${source.publishedAt ? escape(source.publishedAt.slice(0, 10)) : '미상'} · 수집일 ${escape(source.collectedAt.slice(0, 10))}</li>`).join('') ?? ''
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;color:#171923;margin:42px;font-size:12px;line-height:1.6}h1{font-size:26px}h2{font-size:18px;border-bottom:1px solid #ddd;padding-bottom:8px;margin-top:30px}h2 span{float:right;color:#5b5bd6}h3{font-size:13px;margin-bottom:4px}.meta{background:#f4f4f8;padding:16px;border-radius:8px}.turn{border-left:3px solid #8585f5;padding-left:12px;margin:12px 0}section{break-inside:avoid}a{color:#444}small{color:#666}</style></head>
    <body><h1>${escape(session.title)}</h1><div class="meta"><strong>총점 ${report?.totalScore ?? 0}점</strong><p>${escape(report?.summary ?? '')}</p><p>면접 유형: ${session.effectiveType} · 모드: ${session.config.mode} · 생성: ${session.createdAt}</p></div>${questionRows}<h2>참고 출처</h2><ul>${sources}</ul><p><small>AI 평가는 연습 참고용이며 실제 채용 결과를 예측하지 않습니다.</small></p></body></html>`
}

export const exportSessionPdf = async (session: InterviewSession, parent: BrowserWindow | null): Promise<string | null> => {
  const options = { title: '면접 결과 PDF 저장', defaultPath: `${session.title.replace(/[\\/:*?"<>|]/g, '_')}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }
  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(reportHtml(session))}`)
    const bytes = await window.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } })
    writeFileSync(result.filePath, bytes)
    return result.filePath
  } finally { window.destroy() }
}
