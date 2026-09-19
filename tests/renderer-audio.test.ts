import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AudioSampleController, ExclusiveAudioPlayer, type AudioElementLike } from '../src/shared/audio-playback.js'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const fakeAudio = (): AudioElementLike => ({ currentTime: 12, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined) })

describe('renderer audio playback', () => {
  it('allows fetch access to the local media protocol in the CSP', () => {
    const html = readFileSync(join(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8')
    const policy = html.match(/Content-Security-Policy" content="([^"]+)/)?.[1] ?? ''
    const connectSource = policy.split(';').find((directive) => directive.trim().startsWith('connect-src')) ?? ''
    expect(connectSource).toContain('interview-media:')
  })

  it('stops and rewinds the previous sample before playing a new one', async () => {
    const first = fakeAudio(), second = fakeAudio()
    const player = new ExclusiveAudioPlayer(vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second))

    await player.play('first.wav')
    await player.play('second.wav')

    expect(first.pause).toHaveBeenCalledOnce()
    expect(first.currentTime).toBe(0)
    expect(second.play).toHaveBeenCalledOnce()
  })

  it('ignores an older TTS render result when sample clicks overlap', async () => {
    const firstRender = deferred<string>(), secondRender = deferred<string>()
    const render = vi.fn().mockReturnValueOnce(firstRender.promise).mockReturnValueOnce(secondRender.promise)
    const player = { stop: vi.fn(), play: vi.fn().mockResolvedValue(undefined) }
    const controller = new AudioSampleController(render, player)

    const firstClick = controller.replay()
    const secondClick = controller.replay()
    firstRender.resolve('stale.wav')
    await firstClick
    expect(player.play).not.toHaveBeenCalled()
    secondRender.resolve('latest.wav')
    await secondClick

    expect(player.stop).toHaveBeenCalledTimes(2)
    expect(player.play).toHaveBeenCalledOnce()
    expect(player.play).toHaveBeenCalledWith('latest.wav')
  })
})
