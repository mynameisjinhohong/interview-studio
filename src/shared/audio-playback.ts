export interface AudioElementLike {
  currentTime: number
  pause(): void
  play(): Promise<void>
}

export class ExclusiveAudioPlayer {
  private current: AudioElementLike | null = null

  constructor(private readonly createAudio: (url: string) => AudioElementLike) {}

  async play(url: string): Promise<void> {
    this.stop()
    const audio = this.createAudio(url)
    this.current = audio
    try {
      await audio.play()
    } catch (error) {
      if (this.current === audio) this.current = null
      throw error
    }
  }

  stop(): void {
    const audio = this.current
    if (!audio) return
    this.current = null
    audio.pause()
    try { audio.currentTime = 0 } catch { /* media metadata may not be ready yet */ }
  }
}

export class AudioSampleController {
  private requestSequence = 0

  constructor(
    private readonly render: () => Promise<string>,
    private readonly player: Pick<ExclusiveAudioPlayer, 'play' | 'stop'>
  ) {}

  async replay(): Promise<void> {
    const request = ++this.requestSequence
    this.player.stop()
    const url = await this.render()
    if (request !== this.requestSequence) return
    await this.player.play(url)
  }

  stop(): void {
    this.requestSequence += 1
    this.player.stop()
  }
}
