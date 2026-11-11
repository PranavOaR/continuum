import type { CheckSummary } from './projectState'

/**
 * What a repository is built with, read from marker files at its root, and
 * the commands that pass on its code as it is now: the facts an agent would
 * otherwise spend its first minutes finding out. Nothing is guessed beyond them.
 */
export interface ProjectProfile {
  stack: string[]
  /** The package manager its lockfile names, and that lockfile. */
  packageManager: { name: string; lockfile: string } | null
  /** Checks whose latest run passed against the code on disk now. */
  passing: Pick<CheckSummary, 'name' | 'command' | 'evidence'>[]
}

const STACK_MARKERS: readonly (readonly [RegExp, string])[] = [
  [/^package\.json$/, 'Node.js'],
  [/^tsconfig(\..+)?\.json$/, 'TypeScript'],
  [/^(pyproject\.toml|requirements\.txt|setup\.py)$/, 'Python'],
  [/^go\.mod$/, 'Go'],
  [/^Cargo\.toml$/, 'Rust'],
  [/^Gemfile$/, 'Ruby'],
  [/^(pom\.xml|build\.gradle(\.kts)?)$/, 'Java'],
  [/^vite\.config\.[cm]?[jt]s$/, 'Vite'],
  [/^next\.config\.[cm]?[jt]s$/, 'Next.js'],
]

/** Lockfiles in the order a mixed repository is most likely using them. */
const LOCKFILES: readonly (readonly [string, string])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['uv.lock', 'uv'],
  ['poetry.lock', 'poetry'],
  ['Pipfile.lock', 'pipenv'],
  ['Cargo.lock', 'cargo'],
  ['go.sum', 'go'],
  ['Gemfile.lock', 'bundler'],
]

const rootFiles = (paths: Iterable<string>) => [...paths].filter((path) => !path.includes('/'))

/** Recognizable technologies from marker files at the repository root. */
export function detectStack(paths: Iterable<string>): string[] {
  const files = rootFiles(paths)
  return [...new Set(STACK_MARKERS.filter(([pattern]) => files.some((file) => pattern.test(file))).map(([, label]) => label))]
}

export function profileOf(paths: Iterable<string>, checks: readonly CheckSummary[]): ProjectProfile {
  const files = new Set(rootFiles(paths))
  const lock = LOCKFILES.find(([file]) => files.has(file))
  return {
    stack: detectStack(files),
    packageManager: lock ? { name: lock[1], lockfile: lock[0] } : null,
    passing: checks.filter((check) => check.status === 'passed').map(({ name, command, evidence }) => ({ name, command, evidence })),
  }
}
