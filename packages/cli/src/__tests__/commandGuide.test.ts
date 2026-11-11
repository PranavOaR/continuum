import { describe, expect, it } from 'vitest'
import { commandGuide } from '../commandGuide'

// oxlint-disable-next-line no-control-regex -- the escapes are what is being removed
const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, '')
const widths = (lines: readonly string[]) => new Set(lines.map((line) => [...plain(line)].length))
const PREFIX = 'npx -y getcontinuum@0.7.0'

/** The lines of the bordered table itself, between its top and bottom borders. */
const tableOf = (lines: readonly string[]) => {
  const top = lines.findIndex((line) => plain(line).startsWith('┌'))
  const bottom = lines.findIndex((line) => plain(line).startsWith('└'))
  return lines.slice(top, bottom + 1)
}

describe('the command table', () => {
  it('is a bordered table: every line the same width, with column and row lines', () => {
    const table = tableOf(commandGuide(PREFIX, { columns: 120, hasColour: false }))
    expect(widths(table).size).toBe(1)
    expect(plain(table[0])).toMatch(/^┌─+┐$/)
    expect(plain(table.at(-1) ?? '')).toMatch(/^└─+┴─+┘$/)
    expect(table.some((line) => /^│ Command\s+│ What it does\s+│$/.test(plain(line)))).toBe(true)
    expect(table.some((line) => /^│ status\s+│ What is recorded, what changed, and whether checks still hold\s+│$/.test(plain(line)))).toBe(true)
    // A line between every row, as in a word processor's table.
    expect(table.filter((line) => /^├─+┼─+┤$/.test(plain(line))).length).toBeGreaterThan(8)
  })

  it('gives each group a heading row spanning both columns', () => {
    const table = tableOf(commandGuide(PREFIX, { columns: 120, hasColour: false })).map(plain)
    for (const heading of ['While you work', 'Ask the project memory', 'Settings and data', 'Keep it working']) {
      expect(table.some((line) => new RegExp(`^│ ${heading}\\s+│$`).test(line))).toBe(true)
    }
  })

  it('lists every command a person uses, and says how to run them', () => {
    const lines = commandGuide(PREFIX, { columns: 120, hasColour: false }).map(plain)
    for (const command of ['status', 'run -- <command>', 'handoff', 'serve', 'search <words>', 'why <file>[#symbol]', 'check', 'profile', 'config', 'export <file>', 'forget', 'doctor', 'update', 'setup <agent>', 'uninstall']) {
      expect(lines.some((line) => line.startsWith(`│ ${command} `))).toBe(true)
    }
    expect(lines.join('\n')).toContain(`Run any of them as ${PREFIX} <command>`)
    expect(lines.at(-1)).toBe(`${PREFIX} --help lists every option.`)
  })

  it('wraps descriptions to fit a narrow terminal, keeping the borders straight', () => {
    const table = tableOf(commandGuide(PREFIX, { columns: 72, hasColour: false }))
    expect(widths(table)).toEqual(new Set([72]))
    // A wrapped description continues on a row whose command cell is empty.
    expect(table.some((line) => /^│\s+│ \S/.test(plain(line)))).toBe(true)
  })

  it('colours the borders and headings only where the terminal shows colour', () => {
    expect(commandGuide(PREFIX, { columns: 120, hasColour: true }).join('\n')).toContain('\x1b[38;5;')
    expect(commandGuide(PREFIX, { columns: 120, hasColour: false }).join('\n')).not.toContain('\x1b[')
    expect(commandGuide(PREFIX).join('\n')).not.toContain('\x1b[')
  })
})
