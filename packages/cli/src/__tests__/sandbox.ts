import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const GIT_IDENTITY = ['-c', 'user.name=Continuum Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false']

/** A throwaway git repository for tests. Never touches the developer's own repositories. */
export interface Sandbox {
  root: string
  write(path: string, content: string): void
  remove(path: string): void
  git(...args: string[]): string
  commit(message?: string): void
  cleanup(): void
}

export function createSandbox(files: Record<string, string> = {}): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'continuum-sandbox-')))
  const git = (...args: string[]) => execFileSync('git', [...GIT_IDENTITY, ...args], { cwd: root, encoding: 'utf8' }).trim()
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  git('init', '--quiet', '--initial-branch=main')
  for (const [path, content] of Object.entries(files)) write(path, content)
  return {
    root,
    write,
    remove: (path) => rmSync(join(root, path), { force: true }),
    git,
    commit: (message = 'commit') => {
      git('add', '--all')
      git('commit', '--quiet', '--allow-empty', '-m', message)
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
