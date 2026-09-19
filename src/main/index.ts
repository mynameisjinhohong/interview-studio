import { app, BrowserWindow, dialog, ipcMain, net, protocol, session as electronSession, type OpenDialogOptions } from 'electron'
import { existsSync, realpathSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { is } from '@electron-toolkit/utils'
import { z } from 'zod'
import { completeTurnInputSchema, createProfileSchema, idSchema, recordingChunkInputSchema, registerValidationHelpers } from './validation.js'
import { AppDatabase } from './database.js'
import { CliRegistry } from './services/cli-adapters.js'
import { DiagnosticLogger } from './services/logger.js'
import { ProfileService } from './services/profile-service.js'
import { ResearchService } from './services/research-service.js'
import { SttService } from './services/stt-service.js'
import { TtsService } from './services/tts-service.js'
import { RecordingService } from './services/recording-service.js'
import { InterviewService } from './services/interview-service.js'
import { exportSessionPdf } from './export-service.js'
import { providerSchema, sessionConfigSchema, settingsSchema, type CompleteTurnInput, type RecordingChunkInput } from '../shared/contracts.js'
import { IPC } from '../shared/ipc.js'

protocol.registerSchemesAsPrivileged([{ scheme: 'interview-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

let mainWindow: BrowserWindow | null = null
const approvedProfileFiles = new Set<string>()

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 720, backgroundColor: '#080a12',
    title: 'Interview Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  if (is.dev && process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  const root = app.getPath('userData')
  const db = new AppDatabase(root)
  const logger = new DiagnosticLogger(root)
  const cli = new CliRegistry(join(root, 'runtime'), logger)
  const stt = new SttService(root, logger)
  const tts = new TtsService(root)
  const recordings = new RecordingService(root)
  const profiles = new ProfileService(db, cli)
  const research = new ResearchService(root, cli)
  const interviews = new InterviewService(db, cli, research, stt)

  protocol.handle('interview-media', (request) => {
    const encoded = new URL(request.url).pathname.slice(1)
    const requested = Buffer.from(encoded, 'base64url').toString('utf8')
    const realRoot = realpathSync(root)
    const resolved = existsSync(requested) ? realpathSync(requested) : resolve(requested)
    const allowedRoots = [join(realRoot, 'sessions'), join(realRoot, 'cache', 'tts')]
    const allowedPath = allowedRoots.some((allowedRoot) => {
      const pathFromRoot = relative(allowedRoot, resolved)
      return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot)
    })
    if (relative(realRoot, resolved).startsWith('..') || !allowedPath || !['.webm', '.wav', '.aiff', '.mp4'].includes(extname(resolved).toLowerCase())) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(resolved).toString())
  })
  electronSession.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'media'))
  electronSession.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media')

  registerValidationHelpers()
  ipcMain.handle(IPC.bootstrap, () => db.dashboard())
  ipcMain.handle(IPC.selectProfileFiles, async () => {
    const options: OpenDialogOptions = {
      title: '프로필 자료 선택', properties: ['openFile', 'multiSelections'],
      filters: [{ name: '지원 문서', extensions: ['pdf', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg'] }]
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return []
    result.filePaths.forEach((path) => approvedProfileFiles.add(resolve(path)))
    return result.filePaths
  })
  ipcMain.handle(IPC.selectJobPostFile, async () => {
    const options: OpenDialogOptions = {
      title: '채용 공고 파일 선택', properties: ['openFile'],
      filters: [{ name: '채용 공고', extensions: ['pdf', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg'] }]
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    return { name: filePath.split(/[\\/]/).at(-1) ?? '채용 공고', text: (await profiles.extractFile(filePath)).slice(0, 120_000) }
  })
  ipcMain.handle(IPC.createProfile, (_event, input) => {
    const parsed = createProfileSchema.parse(input)
    if (parsed.filePaths.some((path) => !approvedProfileFiles.has(resolve(path)))) throw new Error('파일 선택 창에서 승인되지 않은 경로입니다.')
    parsed.filePaths.forEach((path) => approvedProfileFiles.delete(resolve(path)))
    return profiles.create(parsed)
  })
  ipcMain.handle(IPC.regenerateProfile, (_event, id: string, provider: string) => profiles.regenerate(idSchema.parse(id), providerSchema.parse(provider)))
  ipcMain.handle(IPC.supplementProfile, (_event, id: string, provider: string, context: string) => profiles.supplement(
    idSchema.parse(id), providerSchema.parse(provider), z.string().trim().min(1).max(120_000).parse(context)
  ))
  ipcMain.handle(IPC.updateProfileContext, (_event, id: string, context: string) => profiles.updateContext(idSchema.parse(id), z.string().max(250_000).parse(context)))
  ipcMain.handle(IPC.deleteProfile, (_event, id: string) => db.deleteProfile(idSchema.parse(id)))
  ipcMain.handle(IPC.saveSettings, (_event, patch) => db.saveSettings(settingsSchema.partial().parse(patch)))
  ipcMain.handle(IPC.probeClis, () => cli.probeAll())
  ipcMain.handle(IPC.testCli, (_event, provider: string) => cli.test(providerSchema.parse(provider)))
  ipcMain.handle(IPC.prepareSession, (_event, input) => interviews.prepare(sessionConfigSchema.parse(input)))
  ipcMain.handle(IPC.retentionCandidate, () => db.retentionCandidate())
  ipcMain.handle(IPC.getSession, (_event, id: string) => db.getSession(idSchema.parse(id)))
  ipcMain.handle(IPC.startSession, (_event, id: string) => interviews.start(idSchema.parse(id)))
  ipcMain.handle(IPC.completeTurn, async (_event, input: CompleteTurnInput) => {
    const parsedInput = completeTurnInputSchema.parse({ ...input, audioBytes: new Uint8Array(input.audioBytes) })
    try { return await interviews.completeTurn(parsedInput) }
    catch (error) {
      const session = db.getSession(parsedInput.sessionId)
      if (session) db.updateSession(parsedInput.sessionId, { status: 'partial', errorReason: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString() })
      throw error
    }
  })
  ipcMain.handle(IPC.finishSession, (_event, id: string, reason?: string) => interviews.finish(idSchema.parse(id), z.string().max(1_000).optional().parse(reason)))
  ipcMain.handle(IPC.updateTranscript, (_event, turnId: string, transcript: string) => interviews.reevaluateAfterTranscript(idSchema.parse(turnId), z.string().max(100_000).parse(transcript)))
  ipcMain.handle(IPC.appendRecordingChunk, (_event, input: RecordingChunkInput) => {
    const parsed = recordingChunkInputSchema.parse({ ...input, bytes: new Uint8Array(input.bytes) })
    if (!db.getSession(parsed.sessionId)) throw new Error('세션을 찾을 수 없습니다.')
    recordings.append(parsed.sessionId, parsed.sequence, parsed.bytes)
  })
  ipcMain.handle(IPC.finalizeRecording, async (_event, id: string) => {
    const sessionId = idSchema.parse(id)
    const path = await recordings.finalize(sessionId)
    if (path) db.updateSession(sessionId, { recordingPath: path })
    return path
  })
  ipcMain.handle(IPC.listVoices, () => tts.voices())
  ipcMain.handle(IPC.renderSpeech, async (_event, text: string, voice?: string) => {
    const settings = db.getSettings()
    const filePath = await tts.render(text.slice(0, 4_000), voice ?? settings.ttsVoice, settings.ttsRate)
    return `interview-media://local/${Buffer.from(filePath).toString('base64url')}`
  })
  ipcMain.handle(IPC.getMediaUrl, (_event, path: string) => {
    const resolved = realpathSync(z.string().parse(path))
    const sessionsRoot = realpathSync(join(root, 'sessions'))
    if (relative(sessionsRoot, resolved).startsWith('..') || extname(resolved).toLowerCase() !== '.webm') throw new Error('허용되지 않은 미디어 경로입니다.')
    return `interview-media://local/${Buffer.from(resolved).toString('base64url')}`
  })
  ipcMain.handle(IPC.getSttStatus, () => stt.status())
  ipcMain.handle(IPC.downloadSttModel, (_event, model) => stt.download(model))
  ipcMain.handle(IPC.exportPdf, async (_event, id: string) => {
    const interview = db.getSession(id); if (!interview) throw new Error('세션을 찾을 수 없습니다.')
    return exportSessionPdf(interview, mainWindow)
  })
  ipcMain.handle(IPC.exportVideo, async (_event, id: string) => {
    const interview = db.getSession(id); if (!interview?.recordingPath) throw new Error('녹화 영상이 없습니다.')
    const options = { defaultPath: `${interview.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4`, filters: [{ name: 'MP4', extensions: ['mp4'] }] }
    const selected = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)
    if (selected.canceled || !selected.filePath) return null
    await recordings.exportMp4(interview.recordingPath, selected.filePath)
    return selected.filePath
  })
  ipcMain.handle(IPC.deleteAllData, () => db.deleteAll())

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
