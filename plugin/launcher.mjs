// Starts Continuum for the plugin's hooks and MCP server. Claude Code runs it
// with node directly, no shell, so the plugin works the same on Windows, macOS
// and Linux. Written by hand; packages/claude-code/src/plugin.ts writes the
// hooks and server entries that call it:
//
//   node launcher.mjs [--if-continuum] <npx command…>
//
// --if-continuum (hooks): skip at once unless the repository has a .continuum
// store, so the plugin costs next to nothing in repositories without Continuum.
// The CLI runs from the plugin's own copy (bin/continuum.js) in this process;
// without the copy, the npx command runs instead. Its last part is the subcommand.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const GUARD = '--if-continuum'
const BUNDLE = join(dirname(fileURLToPath(import.meta.url)), 'bin', 'continuum.js')

/** The repository holding `start`: the nearest folder with .git (a folder, or a file in a worktree), else `start` itself. */
function repositoryRoot(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return resolve(start)
  }
}

/** Reads the payload before exiting: leaving it unread breaks Claude Code's write to the hook (EPIPE). */
function skip() {
  process.stdin.on('end', () => process.exit(0))
  process.stdin.resume()
}

const args = process.argv.slice(2)
const guarded = args[0] === GUARD
const fallback = guarded ? args.slice(1) : args

if (guarded && !existsSync(join(repositoryRoot(process.env.CLAUDE_PROJECT_DIR || process.cwd()), '.continuum'))) {
  skip()
} else if (existsSync(BUNDLE)) {
  process.argv = [process.argv[0], BUNDLE, ...fallback.slice(-1)]
  await import(pathToFileURL(BUNDLE).href)
} else {
  // npx is a .cmd shim on Windows, which only a shell can start.
  const { status, error } = spawnSync(fallback[0], fallback.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' })
  if (error) process.stderr.write(`continuum: could not start ${fallback[0]}: ${error.message}\n`)
  process.exit(status ?? 1)
}
