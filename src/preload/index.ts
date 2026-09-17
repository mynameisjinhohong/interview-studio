import { contextBridge, ipcRenderer } from 'electron'
import type { InterviewStudioApi } from '../shared/contracts.js'
import { IPC } from '../shared/ipc.js'

const api: InterviewStudioApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  selectProfileFiles: () => ipcRenderer.invoke(IPC.selectProfileFiles),
  selectJobPostFile: () => ipcRenderer.invoke(IPC.selectJobPostFile),
  createProfile: (input) => ipcRenderer.invoke(IPC.createProfile, input),
  regenerateProfile: (id, provider) => ipcRenderer.invoke(IPC.regenerateProfile, id, provider),
  updateProfileContext: (id, context) => ipcRenderer.invoke(IPC.updateProfileContext, id, context),
  deleteProfile: (id) => ipcRenderer.invoke(IPC.deleteProfile, id),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),
  probeClis: () => ipcRenderer.invoke(IPC.probeClis),
  prepareSession: (config) => ipcRenderer.invoke(IPC.prepareSession, config),
  retentionCandidate: () => ipcRenderer.invoke(IPC.retentionCandidate),
  getSession: (id) => ipcRenderer.invoke(IPC.getSession, id),
  startSession: (id) => ipcRenderer.invoke(IPC.startSession, id),
  completeTurn: (input) => ipcRenderer.invoke(IPC.completeTurn, input),
  finishSession: (id, reason) => ipcRenderer.invoke(IPC.finishSession, id, reason),
  updateTranscript: (turnId, transcript) => ipcRenderer.invoke(IPC.updateTranscript, turnId, transcript),
  appendRecordingChunk: (input) => ipcRenderer.invoke(IPC.appendRecordingChunk, input),
  finalizeRecording: (id) => ipcRenderer.invoke(IPC.finalizeRecording, id),
  listVoices: () => ipcRenderer.invoke(IPC.listVoices),
  renderSpeech: (text, voice) => ipcRenderer.invoke(IPC.renderSpeech, text, voice),
  getMediaUrl: (path) => ipcRenderer.invoke(IPC.getMediaUrl, path),
  getSttStatus: () => ipcRenderer.invoke(IPC.getSttStatus),
  downloadSttModel: (model) => ipcRenderer.invoke(IPC.downloadSttModel, model),
  exportPdf: (id) => ipcRenderer.invoke(IPC.exportPdf, id),
  exportVideo: (id) => ipcRenderer.invoke(IPC.exportVideo, id),
  deleteAllData: () => ipcRenderer.invoke(IPC.deleteAllData)
}

contextBridge.exposeInMainWorld('interviewStudio', api)
