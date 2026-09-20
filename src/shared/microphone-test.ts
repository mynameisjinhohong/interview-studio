export const microphoneLevelPercent = (samples: Uint8Array): number => {
  if (!samples.length) return 0
  let sumSquares = 0
  for (const sample of samples) {
    const normalized = (sample - 128) / 128
    sumSquares += normalized * normalized
  }
  return Math.min(100, Math.round(Math.sqrt(sumSquares / samples.length) * 400))
}

export const hasRecordedMicrophoneSignal = (peakLevel: number, byteLength: number): boolean =>
  peakLevel >= 2 && byteLength >= 1_000
