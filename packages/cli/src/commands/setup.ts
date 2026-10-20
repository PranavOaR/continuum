import { initWorkspace, locateWorkspace, registerRepository, scanRepository, unregisterRepository } from '@continuum/capture'
import {
  MCP_FILE,
  removeClaudeCodeSetup,
  removeCodexSetup,
  removeCursorSetup,
  removeVsCodeSetup,
  setupClaudeCode,
  setupCodex,
  setupCursor,
  setupVsCode,
  type Invocation,
  type SetupResult,
} from '@continuum/claude-code'
import { EXIT_OK, EXIT_USAGE, type Io } from '../io'

interface Target {
  name: string
  setup: (root: string, invocation: Invocation) => Promise<SetupResult>
  remove: (root: string) => Promise<SetupResult>
  /** What to do next, shown after setup. */
  next: (invocation: Invocation) => string[]
  /** What can be committed to share the setup with your team, when it runs through npx. */
  shared: string
}

const TARGETS: Record<string, Target> = {
  'claude-code': {
    name: 'Claude Code',
    setup: setupClaudeCode,
    remove: removeClaudeCodeSetup,
    next: () => [
      'Next: start (or restart) Claude Code in this repository and approve the "continuum" MCP server.',
      'New sessions are briefed on where the last one left off; edits and progress are recorded as you work.',
    ],
    shared: MCP_FILE,
  },
  codex: {
    name: 'Codex',
    setup: setupCodex,
    remove: removeCodexSetup,
    next: () => [
      'Next: start Codex in this repository and trust the project when it asks (Codex loads .codex/ only for trusted projects).',
      'Then run /hooks in Codex and trust the Continuum hooks; Codex runs new hooks only after you review them.',
      'New sessions are briefed on where the last one left off; edits (apply_patch) and progress are recorded as you work.',
      'Codex does not report exit codes, so record tests with `continuum run -- <command>` for verified results.',
    ],
    shared: '.codex/',
  },
  cursor: {
    name: 'Cursor',
    setup: setupCursor,
    remove: removeCursorSetup,
    next: () => [
      'Next: open this repository in Cursor and enable the "continuum" MCP server in Settings → MCP.',
      'The always-applied rule asks Cursor to read the handoff first and keep the task current through the MCP tools.',
      'Cursor has no hooks Continuum uses: run `continuum session start --agent cursor` and `continuum start` to capture its edits.',
    ],
    shared: '.cursor/',
  },
  vscode: {
    name: 'VS Code (GitHub Copilot)',
    setup: setupVsCode,
    remove: removeVsCodeSetup,
    next: () => [
      'Next: open this repository in VS Code, trust the workspace, and start the "continuum" server when VS Code offers to (or from .vscode/mcp.json).',
      'Copilot agent sessions are then briefed on where the last one left off, and its edits and progress are recorded as you work.',
      'Agent hooks are a preview in VS Code 1.109+; check that the chat.useHooks setting is on. Without them, the instructions file asks Copilot to call get_handoff.',
      'VS Code does not report exit codes, so record tests with `continuum run -- <command>` for verified results.',
    ],
    shared: '.vscode/mcp.json and .github/',
  },
}

export const SETUP_USAGE = `Usage: continuum setup <${Object.keys(TARGETS).join('|')}> [--remove]`

function report(io: Io, result: SetupResult): void {
  for (const file of result.files) io.out(`  ${file.action.padEnd(9)} ${file.path}${file.note ? `: ${file.note}` : ''}`)
}

/** Connects (or disconnects) an agent to Continuum for this repository only. */
export async function setupCommand(io: Io, args: readonly string[], invocation: Invocation): Promise<number> {
  const [targetName, ...flags] = args
  const remove = flags.length === 1 && flags[0] === '--remove'
  const target = targetName && Object.hasOwn(TARGETS, targetName) ? TARGETS[targetName] : undefined
  if (!target || (flags.length > 0 && !remove)) {
    io.err(`continuum: ${targetName ? `unsupported setup target or option: ${args.join(' ')}` : 'missing setup target'}`)
    io.err(SETUP_USAGE)
    return EXIT_USAGE
  }
  if (remove) {
    const { root } = await locateWorkspace(io.cwd)
    const result = await target.remove(root)
    await unregisterRepository(io.configDir, root)
    io.out(result.files.length === 0 ? `${target.name} was not set up here; nothing to remove.` : `Removed Continuum from ${target.name} for this repository:`)
    report(io, result)
    return EXIT_OK
  }
  const { workspace, store, created } = await initWorkspace(io.cwd)
  let result: SetupResult
  try {
    // Write first, then scan: the files setup writes are recorded now, not reported later as changes no session explains.
    result = await target.setup(workspace.root, invocation)
    await scanRepository(store, workspace.root, { now: io.now })
  } finally {
    store.close()
  }
  await registerRepository(io.configDir, workspace.root, io.now())
  io.out(`Connected ${target.name} to Continuum in ${workspace.root}${created ? ' (and initialized Continuum)' : ''}:`)
  report(io, result)
  io.out('')
  for (const line of target.next(invocation)) io.out(line)
  io.out(
    invocation.portable
      ? `The configuration runs Continuum through npx, so you can commit ${target.shared} to share it with your team.`
      : `These files point at Continuum on this machine (${invocation.args.at(-1) ?? invocation.command}), so they are kept out of git.`,
  )
  return EXIT_OK
}
