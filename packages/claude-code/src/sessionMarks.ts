import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CONTINUUM_DIR } from '@continuum/capture'

/**
 * Small per-session notes kept in .continuum/ (never in the record): what a
 * session was already reminded of, or already asked. Only recent sessions are
 * kept, so a file never grows past a few kilobytes.
 */
const KEPT_SESSIONS = 20

type Marks = Record<string, string[]>

const pathOf = (root: string, file: string) => join(root, CONTINUUM_DIR, file)

async function read(root: string, file: string): Promise<Marks> {
  if (!existsSync(pathOf(root, file))) return {}
  try {
    const parsed: unknown = JSON.parse(await readFile(pathOf(root, file), 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Marks) : {}
  } catch {
    return {}
  }
}

export async function sessionMarks(root: string, file: string, sessionId: string): Promise<Set<string>> {
  return new Set((await read(root, file))[sessionId] ?? [])
}

export async function addSessionMarks(root: string, file: string, sessionId: string, marks: readonly string[]): Promise<void> {
  const { [sessionId]: earlier = [], ...others } = await read(root, file)
  const kept = Object.entries(others).slice(-(KEPT_SESSIONS - 1))
  const next = Object.fromEntries([...kept, [sessionId, [...new Set([...earlier, ...marks])]]])
  const temporary = `${pathOf(root, file)}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 })
  await rename(temporary, pathOf(root, file))
}
