export const IPC = {
  bootstrap: 'app:bootstrap', selectProfileFiles: 'profile:select-files', createProfile: 'profile:create',
  selectJobPostFile: 'session:select-job-post',
  regenerateProfile: 'profile:regenerate', updateProfileContext: 'profile:update-context', deleteProfile: 'profile:delete', saveSettings: 'settings:save',
  probeClis: 'cli:probe', prepareSession: 'session:prepare', getSession: 'session:get',
  retentionCandidate: 'session:retention-candidate',
  startSession: 'session:start', completeTurn: 'session:complete-turn', finishSession: 'session:finish',
  updateTranscript: 'session:update-transcript', appendRecordingChunk: 'recording:append',
  finalizeRecording: 'recording:finalize', listVoices: 'tts:voices', renderSpeech: 'tts:render',
  getMediaUrl: 'media:url', getSttStatus: 'stt:status', downloadSttModel: 'stt:download-model',
  exportPdf: 'export:pdf', exportVideo: 'export:video', deleteAllData: 'data:delete-all'
} as const
