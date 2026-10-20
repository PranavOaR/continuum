import { FolderOpen } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { matchCommands, type Command } from '../components/layout/commands'

const command = (label: string, keywords?: string): Command => ({ id: label, group: 'Actions', label, keywords, icon: FolderOpen, run: () => {} })
const COMMANDS = [command('Switch to dark theme', 'theme appearance mode'), command('Prepare a handoff', 'briefing agent'), command('Activity')]

describe('matchCommands', () => {
  it('matches every word of the query, in any order, against labels and keywords', () => {
    expect(matchCommands(COMMANDS, 'dark').map((match) => match.label)).toEqual(['Switch to dark theme'])
    expect(matchCommands(COMMANDS, 'mode switch').map((match) => match.label)).toEqual(['Switch to dark theme'])
    expect(matchCommands(COMMANDS, 'BRIEFING').map((match) => match.label)).toEqual(['Prepare a handoff'])
  })

  it('returns nothing when any word is missing, and everything for a blank query', () => {
    expect(matchCommands(COMMANDS, 'dark handoff')).toEqual([])
    expect(matchCommands(COMMANDS, '   ')).toHaveLength(COMMANDS.length)
  })
})
