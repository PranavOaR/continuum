import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Starts `command` and resolves once it has started; it is never waited on. */
export type Launcher = (command: string, args: readonly string[]) => Promise<void>

/** How each platform opens a file in the default browser (explorer.exe hands an .html file to it, with no shell to quote for). */
const OPENERS: Partial<Record<NodeJS.Platform, string>> = { darwin: 'open', linux: 'xdg-open', win32: 'explorer.exe' }
/** Long enough for the browser to read the page, short enough that it does not linger. */
const CLEANUP_AFTER_MS = 30_000
const PRIVATE_FILE_MODE = 0o600

const spawnDetached: Launcher = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: 'ignore', detached: true })
    child.once('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT' ? new Error(`${command} was not found`) : error))
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })

const escapeAttribute = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')

/** A page that sends the browser on to `url` at once, with a link in case it does not. */
function redirectPage(url: string, label: string): string {
  const href = escapeAttribute(url)
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${href}"><title>Continuum</title><p><a href="${href}">${escapeAttribute(label)}</a></p>\n`
}

export interface OpenOptions {
  platform?: NodeJS.Platform
  launcher?: Launcher
  cleanupAfterMs?: number
  /** The text of the page's fallback link. */
  label?: string
}

/**
 * Opens a link in the default browser. The dashboard's launch link carries
 * the access token, and a command line can be read by other users on the
 * machine (`ps`), so the browser is given a page only this user can read,
 * which redirects to the link; the page is deleted shortly after.
 */
export async function openInBrowser(url: string, options: OpenOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform
  const opener = OPENERS[platform]
  if (!opener) throw new Error(`no known way to open a browser on ${platform}`)
  const dir = mkdtempSync(join(tmpdir(), 'continuum-open-'))
  const remove = () => rmSync(dir, { recursive: true, force: true })
  try {
    const page = join(dir, 'dashboard.html')
    writeFileSync(page, redirectPage(url, options.label ?? 'Open the Continuum dashboard'), { mode: PRIVATE_FILE_MODE })
    await (options.launcher ?? spawnDetached)(opener, [page])
  } catch (error) {
    remove()
    throw error
  }
  // mkdtemp makes the directory owner-only (on Windows, the user's temp folder already is); the page goes once the browser has read it.
  setTimeout(remove, options.cleanupAfterMs ?? CLEANUP_AFTER_MS).unref()
}
