import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentType } from '@continuum/core'
import { ANTIGRAVITY_HOOKS_FILE } from './antigravitySetup'
import { CODEX_HOOKS_FILE } from './codexSetup'
import { CURSOR_RULE_FILE, RULE_MARKER } from './cursorSetup'
import type { HookAgent } from './hookPayload'
import { isContinuumPluginEnabled } from './pluginStatus'
import { HOOKS_FILE, isContinuumHandler } from './setup'
import { VSCODE_HOOKS_FILE } from './vscodeSetup'

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const entries = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** The file's text, or '' when it is missing or unreadable: doctor reports broken agent configs on its own. */
async function text(path: string): Promise<string> {
  if (!existsSync(path)) return ''
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

function hasClaudeCodeHooks(settings: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(settings)
  } catch {
    return false
  }
  const hooks = isObject(parsed) && isObject(parsed.hooks) ? parsed.hooks : {}
  return Object.values(hooks)
    .flatMap(entries)
    .flatMap((group) => (isObject(group) ? entries(group.hooks) : []))
    .some((handler) => isObject(handler) && isContinuumHandler(handler))
}

/** Agents whose hooks this repository's own config files run Continuum from. */
export async function connectedHookAgents(root: string): Promise<Set<HookAgent>> {
  const [claude, codex, vscode, antigravity] = await Promise.all([HOOKS_FILE, CODEX_HOOKS_FILE, VSCODE_HOOKS_FILE, ANTIGRAVITY_HOOKS_FILE].map((file) => text(join(root, file))))
  const connected = new Set<HookAgent>()
  if (hasClaudeCodeHooks(claude)) connected.add('claude-code')
  if (codex.includes('ingest --agent codex')) connected.add('codex')
  if (vscode.includes('ingest --agent vscode')) connected.add('vscode')
  if (antigravity.includes('ingest --agent antigravity')) connected.add('antigravity')
  return connected
}

/**
 * The agents `continuum setup` connected to this repository, from its own
 * files: what `continuum update` re-runs setup for. The Claude Code plugin is
 * not among them; Claude Code updates it.
 */
export async function setUpAgents(root: string): Promise<AgentType[]> {
  const [hooks, cursorRule] = await Promise.all([connectedHookAgents(root), text(join(root, CURSOR_RULE_FILE))])
  return [...hooks, ...(cursorRule.includes(RULE_MARKER) ? (['cursor'] as const) : [])]
}

/**
 * Every agent connected to this repository, by `setup` or, for Claude Code, by
 * the plugin, whose hooks live outside the repository. Cursor has no hooks; the
 * rule marks it, since setup writes that even when it leaves a tracked mcp.json alone.
 */
export async function connectedAgents(root: string, claudeConfigDir: string): Promise<AgentType[]> {
  const [hooks, hasPlugin, cursorRule] = await Promise.all([connectedHookAgents(root), isContinuumPluginEnabled(root, claudeConfigDir), text(join(root, CURSOR_RULE_FILE))])
  return [
    ...(hooks.has('claude-code') || hasPlugin ? (['claude-code'] as const) : []),
    ...(hooks.has('codex') ? (['codex'] as const) : []),
    ...(cursorRule.includes(RULE_MARKER) ? (['cursor'] as const) : []),
    ...(hooks.has('vscode') ? (['vscode'] as const) : []),
    ...(hooks.has('antigravity') ? (['antigravity'] as const) : []),
  ]
}
