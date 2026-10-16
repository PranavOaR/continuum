import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Repositories connected with `continuum setup`, so `continuum serve` can show them all. */
export const REGISTRY_FILE = 'repos.json'
const REGISTRY_VERSION = 1

export interface RegisteredRepository {
  root: string
  addedAt: string
}

interface RegistryFile {
  version: typeof REGISTRY_VERSION
  repositories: RegisteredRepository[]
}

/** CONTINUUM_CONFIG_DIR, else $XDG_CONFIG_HOME/continuum, else ~/.config/continuum. */
export function defaultConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CONTINUUM_CONFIG_DIR) return env.CONTINUUM_CONFIG_DIR
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'continuum')
}

/** A missing or unreadable registry is empty: it is a convenience, never a reason to fail. */
export async function readRegistry(configDir: string): Promise<RegisteredRepository[]> {
  const path = join(configDir, REGISTRY_FILE)
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<RegistryFile>
    if (!Array.isArray(parsed.repositories)) return []
    return parsed.repositories.filter((entry): entry is RegisteredRepository => typeof entry?.root === 'string' && typeof entry.addedAt === 'string')
  } catch {
    return []
  }
}

async function writeRegistry(configDir: string, repositories: RegisteredRepository[]): Promise<void> {
  await mkdir(configDir, { recursive: true, mode: 0o700 })
  const path = join(configDir, REGISTRY_FILE)
  const temporary = `${path}.${process.pid}.tmp`
  const body: RegistryFile = { version: REGISTRY_VERSION, repositories }
  await writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

export async function registerRepository(configDir: string, root: string, at: Date): Promise<void> {
  const repositories = await readRegistry(configDir)
  if (repositories.some((entry) => entry.root === root)) return
  await writeRegistry(configDir, [...repositories, { root, addedAt: at.toISOString() }])
}

export async function unregisterRepository(configDir: string, root: string): Promise<boolean> {
  const repositories = await readRegistry(configDir)
  const kept = repositories.filter((entry) => entry.root !== root)
  if (kept.length === repositories.length) return false
  await writeRegistry(configDir, kept)
  return true
}
