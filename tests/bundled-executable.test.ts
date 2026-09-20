import { describe, expect, it } from 'vitest'
import { resolveBundledExecutable } from '../src/main/services/bundled-executable.js'

describe('bundled executable path resolution', () => {
  it('uses the unpacked FFmpeg path for a Windows packaged app', () => {
    const packed = String.raw`C:\Program Files\Interview Studio\resources\app.asar\node_modules\ffmpeg-static\ffmpeg.exe`
    const unpacked = String.raw`C:\Program Files\Interview Studio\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe`

    expect(resolveBundledExecutable(packed, (path) => path === unpacked)).toBe(unpacked)
  })

  it('uses the unpacked FFmpeg path for a macOS packaged app', () => {
    const packed = '/Applications/Interview Studio.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg'
    const unpacked = '/Applications/Interview Studio.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg'

    expect(resolveBundledExecutable(packed, (path) => path === unpacked)).toBe(unpacked)
  })

  it('keeps a normal development executable path', () => {
    const development = '/workspace/node_modules/ffmpeg-static/ffmpeg'
    expect(resolveBundledExecutable(development, (path) => path === development)).toBe(development)
  })
})
