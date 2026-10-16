// Times reading the working tree of a generated repository.
//   npx tsx scripts/bench-scan.ts [files=50000] [dirty=50]
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readWorkingTree } from '../packages/capture/src/git'

const FILES = Number(process.argv[2] ?? 50_000)
const DIRTY = Number(process.argv[3] ?? 50)
const PER_DIR = 500
const RUNS = 3

const root = mkdtempSync(join(tmpdir(), 'continuum-bench-'))
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', ...args], { cwd: root, stdio: 'ignore' })
try {
  git('init', '-q')
  for (let index = 0; index < FILES; index += 1) {
    const dir = join(root, `pkg${Math.floor(index / PER_DIR)}`)
    if (index % PER_DIR === 0) mkdirSync(dir)
    writeFileSync(join(dir, `file${index}.ts`), `export const value${index} = ${index}\n`)
  }
  git('add', '-A')
  git('commit', '-qm', 'bench')
  for (let index = 0; index < DIRTY; index += 1) writeFileSync(join(root, `pkg0/file${index}.ts`), `export const changed = ${index}\n`)

  const times: number[] = []
  for (let run = 0; run < RUNS; run += 1) {
    const started = performance.now()
    const tree = await readWorkingTree(root)
    times.push(performance.now() - started)
    if (tree.files.size !== FILES) throw new Error(`expected ${FILES} files, got ${tree.files.size}`)
  }
  console.log(`${FILES} files, ${DIRTY} changed: best ${Math.min(...times).toFixed(0)} ms over ${RUNS} runs`)
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 5 })
}
