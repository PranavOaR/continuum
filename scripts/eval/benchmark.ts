// The public handoff benchmark: can the next agent answer from what it was
// told? Every scenario's questions are put to Claude twice, once with
// Continuum's briefing and tool replies and once with only what an agent
// without memory has (the files and the git history), and scored by the same
// patterns. Uses your Claude account: about 14 calls.
//
//   npm run bench:handoff
//
// Writes docs/benchmark/results.json and the results table in the benchmark docs page.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClaudeUnavailableError, evaluate, type Condition, type Evaluated } from './evaluate'
import { SCENARIOS } from './scenarios'

const ROOT = join(import.meta.dirname, '..', '..')
const RESULTS = join(ROOT, 'docs/benchmark/results.json')
const PAGE = join(ROOT, 'apps/web/src/site/docs/benchmark.md')
const START = '<!-- results:start -->'
const END = '<!-- results:end -->'
const CONDITIONS: readonly Condition[] = ['continuum', 'none']

interface ScenarioResult {
  name: string
  passed: number
  total: number
  failed: string[]
}

interface Run {
  condition: Condition
  passed: number
  total: number
  scenarios: ScenarioResult[]
}

const percent = (passed: number, total: number) => `${Math.round((passed / total) * 100)}%`

function runCondition(condition: Condition): { run: Run; models: Set<string> } {
  const models = new Set<string>()
  const scenarios = SCENARIOS.map((scenario) => {
    const result: Evaluated = evaluate(scenario, 'claude', condition)
    if (result.model) models.add(result.model)
    console.log(`${condition.padEnd(10)} ${percent(result.passed, result.total).padStart(4)}  ${scenario.name}`)
    return { name: scenario.name, passed: result.passed, total: result.total, failed: result.failed }
  })
  const passed = scenarios.reduce((sum, scenario) => sum + scenario.passed, 0)
  const total = scenarios.reduce((sum, scenario) => sum + scenario.total, 0)
  return { run: { condition, passed, total, scenarios }, models }
}

/** The results as the docs page shows them: one row per scenario, both conditions side by side. */
function table(runs: readonly Run[], model: string, date: string): string {
  const [withContinuum, without] = runs
  const rows = withContinuum.scenarios.map((scenario, index) => {
    const other = without.scenarios[index]
    return `| ${scenario.name} | ${scenario.passed}/${scenario.total} | ${other.passed}/${other.total} |`
  })
  return [
    `Run on ${date} with \`${model}\`, through the \`claude\` CLI.`,
    '',
    '| Scenario | With Continuum | Without memory |',
    '|---|---|---|',
    ...rows,
    `| **All questions** | **${withContinuum.passed}/${withContinuum.total} (${percent(withContinuum.passed, withContinuum.total)})** | **${without.passed}/${without.total} (${percent(without.passed, without.total)})** |`,
  ].join('\n')
}

let results: ReturnType<typeof runCondition>[]
try {
  // Every condition must finish: a partial run would publish numbers that compare unlike things.
  results = CONDITIONS.map(runCondition)
} catch (error) {
  if (!(error instanceof ClaudeUnavailableError)) throw error
  console.error(`\n${error.message}\nNothing was written; run npm run bench:handoff again once it can answer.`)
  process.exit(1)
}
const models = [...new Set(results.flatMap(({ models: used }) => [...used]))]
const model = models.join(', ') || 'unknown'
const runs = results.map(({ run }) => run)
const date = new Date().toISOString().slice(0, 10)
const cli = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim()
writeFileSync(RESULTS, `${JSON.stringify({ date, model, cli, runs }, null, 2)}\n`)
const page = readFileSync(PAGE, 'utf8')
const start = page.indexOf(START)
const end = page.indexOf(END)
if (start === -1 || end === -1) throw new Error(`${PAGE} needs ${START} and ${END} around the results.`)
writeFileSync(PAGE, `${page.slice(0, start + START.length)}\n${table(runs, model, date)}\n${page.slice(end)}`)
console.log(`\nWith Continuum: ${percent(runs[0].passed, runs[0].total)}. Without memory: ${percent(runs[1].passed, runs[1].total)}. Written to docs/benchmark/results.json and the benchmark docs page.`)
