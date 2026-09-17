import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { BaseAdapter, CliRegistry, type InvokeOptions } from '../src/main/services/cli-adapters.js'
import { DiagnosticLogger } from '../src/main/services/logger.js'
import { runProcess } from '../src/main/services/process-runner.js'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

class TestAdapter extends BaseAdapter {
  provider = 'codex' as const
  command = basename(process.execPath)
  constructor(runtime: string, logger: DiagnosticLogger, private script: string) { super(runtime, logger) }
  protected args(_schemaPath: string, _options: InvokeOptions): string[] { return ['-e', this.script] }
  protected requiredCapabilities() { return [] }
}

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'interview-cli-contract-')); roots.push(root)
  mkdirSync(join(root, 'logs'), { recursive: true })
  return { root, logger: new DiagnosticLogger(root) }
}

describe('CLI invocation contract', () => {
  it.skipIf(process.env.LIVE_GUI_PATH !== '1')('probes the installed Codex CLI with the Finder-style macOS PATH', async () => {
    const { root, logger } = setup()
    const originalPath = process.env.PATH
    process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
    try {
      const adapter = new CliRegistry(join(root, 'runtime'), logger).get('codex')
      const probe = await adapter.probe()
      expect(probe.installed).toBe(true)
      expect(probe.version).toContain('codex-cli')
      expect(probe.error ?? '').not.toContain('node: No such file or directory')
      const response = await adapter.invokeStructured(
        'ok를 true로 반환하세요.', {},
        { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        z.object({ ok: z.boolean() }), { timeoutMs: 60_000, idleTimeoutMs: 45_000, retries: 0 }
      )
      expect(response).toEqual({ ok: true })
    } finally {
      process.env.PATH = originalPath
    }
  }, 90_000)

  it.skipIf(process.platform === 'win32')('runs an env-node CLI when its runtime directory is outside the GUI PATH', async () => {
    const { root } = setup()
    const runtimeBin = join(root, 'runtime-bin')
    mkdirSync(runtimeBin)
    symlinkSync(process.execPath, join(runtimeBin, 'node'))
    const cli = join(runtimeBin, 'fake-cli')
    writeFileSync(cli, '#!/usr/bin/env node\nconsole.log("runtime-ok")\n')
    chmodSync(cli, 0o755)

    const result = await runProcess(cli, [], {
      cwd: root, env: { PATH: '/path-that-does-not-contain-node' }, pathEntries: [runtimeBin], timeoutMs: 2_000
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('runtime-ok')
  })

  it('retries three times after the first failure and accepts the fourth JSON result', async () => {
    const { root, logger } = setup()
    const counter = join(root, 'counter.txt')
    const script = `const fs=require('fs');const p=${JSON.stringify(counter)};const n=fs.existsSync(p)?Number(fs.readFileSync(p,'utf8'))+1:1;fs.writeFileSync(p,String(n));console.log(n===4?'{"ok":true}':'invalid-json')`
    const result = await new TestAdapter(root, logger, script).invokeStructured('test', {}, {}, z.object({ ok: z.boolean() }))
    expect(result).toEqual({ ok: true })
    expect(readFileSync(counter, 'utf8')).toBe('4')
  })

  it('terminates a timed-out call', async () => {
    const { root, logger } = setup()
    const adapter = new TestAdapter(root, logger, `setTimeout(()=>console.log('{"ok":true}'),200)`)
    await expect(adapter.invokeStructured('test', {}, {}, z.object({ ok: z.boolean() }), { timeoutMs: 20, retries: 0 })).rejects.toThrow('20ms')
  })

  it('terminates a call that stays inactive before the overall deadline', async () => {
    const { root, logger } = setup()
    const adapter = new TestAdapter(root, logger, `setTimeout(()=>console.log('{"ok":true}'),100)`)
    await expect(adapter.invokeStructured('test', {}, {}, z.object({ ok: z.boolean() }), {
      timeoutMs: 250, idleTimeoutMs: 25, retries: 0
    })).rejects.toThrow('25ms')
  })

  it('refreshes the inactivity deadline when the CLI emits progress', async () => {
    const { root, logger } = setup()
    const adapter = new TestAdapter(root, logger, `const timer=setInterval(()=>console.error('progress'),20);setTimeout(()=>{clearInterval(timer);console.log('{"ok":true}')},250)`)
    const result = await adapter.invokeStructured('test', {}, {}, z.object({ ok: z.boolean() }), {
      timeoutMs: 500, idleTimeoutMs: 120, retries: 0
    })
    expect(result).toEqual({ ok: true })
  })
})
