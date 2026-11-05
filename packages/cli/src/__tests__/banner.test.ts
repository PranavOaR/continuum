import { afterEach, describe, expect, it } from 'vitest'
import { createSandbox, type Sandbox } from '@continuum/capture/testing'
import { BANNER_COLUMNS, renderBanner, terminalBanner } from '../banner'
import { cli } from './harness'

const ESCAPE = '\x1b['
const TERMINAL = { isTTY: true, columns: 120, hasColors: () => true }
const BANNER = ['-- banner --']
const sandboxes: Sandbox[] = []

afterEach(() => {
  for (const repo of sandboxes.splice(0)) repo.cleanup()
})

function sandbox() {
  const repo = createSandbox({ 'a.ts': 'a' })
  sandboxes.push(repo)
  return repo
}

describe('renderBanner', () => {
  it('names the version and where the data stays', () => {
    expect(renderBanner('1.2.3', false).join('\n')).toContain('v1.2.3 · local-first · everything stays on this machine')
  })

  it('colours each row of the wordmark and dims the tagline', () => {
    const lines = renderBanner('1.2.3', true)
    const wordmark = lines.filter((line) => line.includes('█'))
    expect(wordmark).toHaveLength(5)
    expect(new Set(wordmark.map((line) => /38;5;(\d+)m/.exec(line)?.[1])).size).toBeGreaterThan(1)
    expect(lines.find((line) => line.includes('local-first'))).toContain(`${ESCAPE}2m`)
  })

  it('writes no escape codes without colour', () => {
    expect(renderBanner('1.2.3', false).join('\n')).not.toContain(ESCAPE)
  })

  it('never draws wider than BANNER_COLUMNS', () => {
    const widest = Math.max(...renderBanner('1.2.3', false).filter((line) => line.includes('█')).map((line) => line.length))
    expect(widest).toBeLessThanOrEqual(BANNER_COLUMNS)
  })
})

describe('terminalBanner', () => {
  it('shows the banner to someone at a terminal, in colour when it can', () => {
    expect(terminalBanner(TERMINAL, {}, '1.2.3').join('\n')).toContain(ESCAPE)
    expect(terminalBanner({ ...TERMINAL, hasColors: () => false }, {}, '1.2.3').join('\n')).not.toContain(ESCAPE)
  })

  it('stays out of pipes, CI and terminals too narrow to draw it', () => {
    expect(terminalBanner({ isTTY: false }, {}, '1.2.3')).toEqual([])
    expect(terminalBanner({ ...TERMINAL, isTTY: undefined }, {}, '1.2.3')).toEqual([])
    expect(terminalBanner(TERMINAL, { CI: 'true' }, '1.2.3')).toEqual([])
    expect(terminalBanner({ ...TERMINAL, columns: BANNER_COLUMNS - 1 }, {}, '1.2.3')).toEqual([])
  })
})

describe('commands that start Continuum', () => {
  it('opens the help of a bare `continuum` with the banner', async () => {
    const { out } = await cli(sandbox().root, [], { banner: BANNER })
    expect(out.indexOf(BANNER[0])).toBe(0)
    expect(out).toContain('Usage: continuum')
  })

  it('opens `setup` with the banner', async () => {
    const { out } = await cli(sandbox().root, ['setup', 'cursor'], { banner: BANNER })
    expect(out.indexOf(BANNER[0])).toBe(0)
  })

  it('prints nothing extra when there is no terminal', async () => {
    const { out } = await cli(sandbox().root, [])
    expect(out.startsWith('continuum — keep AI coding work continuous')).toBe(true)
  })

  it('leaves output other programs read alone', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'], { banner: BANNER })
    for (const argv of [['--version'], ['status'], ['handoff'], ['ingest']]) {
      expect((await cli(repo.root, argv, { banner: BANNER })).out).not.toContain(BANNER[0])
    }
  })

  it('does not open a failed `start` with the banner', async () => {
    const { out, err } = await cli(sandbox().root, ['start'], { banner: BANNER })
    expect(err).toContain('continuum:')
    expect(out).not.toContain(BANNER[0])
  })

  it('opens `start` with the banner', async () => {
    const repo = sandbox()
    await cli(repo.root, ['init'])
    const controller = new AbortController()
    const lines: string[] = []
    const running = cli(repo.root, ['start'], {
      banner: BANNER,
      signal: controller.signal,
      out: (line) => {
        lines.push(line)
        if (line.startsWith('Watching') || line.startsWith('Polling')) controller.abort()
      },
    })
    await running
    expect(lines[0]).toBe(BANNER[0])
  }, 20_000)
})
