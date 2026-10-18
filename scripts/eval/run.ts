// Briefing quality evaluation.
//
//   npm run eval                        # is every answer in the briefing? (deterministic, free, run in CI)
//   npm run eval -- --agent claude      # ask Claude Code the questions from the briefing alone (uses your account)
//
// Briefing mode must score 100%: every answer is in its section in exactly the
// expected words, and no section makes a misleading claim. CI runs it.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectState, renderHandoff, sinceYouLeft } from '../../packages/context/src/index'
import { ContextStore } from '../../packages/store/src/index'
import { EVAL_NOW, SCENARIOS, type Question, type Scenario } from './scenarios'

/** The same budget a real session start gets. */
const BRIEFING_CHARS = 6_000
const CLAUDE_TIMEOUT_MS = 180_000

type Mode = 'briefing' | 'claude'

function briefingFor(scenario: Scenario): string {
  const store = ContextStore.open(':memory:')
  try {
    store.recordAll(scenario.events)
    const tree = { root: `/eval/${scenario.name.replace(/\W+/g, '-')}`, revision: 'e7a1c00', files: new Map(Object.entries(scenario.files)) }
    const { sessionId, agent } = scenario.resumingSession
    const state = projectState(store, tree, EVAL_NOW, { excludeSessionId: sessionId })
    return renderHandoff(state, { now: EVAL_NOW, maxChars: BRIEFING_CHARS, since: sinceYouLeft(store, agent, sessionId) })
  } finally {
    store.close()
  }
}

/** The text under a `## heading` that starts with `title`, or the whole briefing when no section is named. */
function sectionOf(briefing: string, title: string | undefined): string {
  if (!title) return briefing
  const start = briefing.indexOf(`\n## ${title}`)
  if (start === -1) return ''
  const end = briefing.indexOf('\n## ', start + 4)
  return briefing.slice(start, end === -1 ? undefined : end)
}

/** Every expected pattern appears, and no forbidden one does. */
function passes(question: Question, answer: string): boolean {
  return question.expect.every((pattern) => pattern.test(answer)) && !(question.forbid ?? []).some((pattern) => pattern.test(answer))
}

/** Asks Claude Code, with no tools and in an empty directory, to answer from the briefing alone. */
function askClaude(briefing: string, questions: readonly Question[]): Map<string, string> {
  const prompt = [
    'You are starting work on a software project. Below is the only information you have about it.',
    'Answer each question in one or two sentences, on its own line, starting with its number and a period.',
    '',
    '<briefing>',
    briefing,
    '</briefing>',
    '',
    ...questions.map((question, index) => `${index + 1}. ${question.ask}`),
  ].join('\n')
  const empty = mkdtempSync(join(tmpdir(), 'continuum-eval-'))
  try {
    const output = execFileSync('claude', ['-p', prompt, '--output-format', 'text'], { cwd: empty, encoding: 'utf8', timeout: CLAUDE_TIMEOUT_MS })
    const answers = new Map<string, string>()
    for (const match of output.matchAll(/^\s*(\d+)\.\s*(.+)$/gm)) {
      const question = questions[Number(match[1]) - 1]
      if (question) answers.set(question.id, `${answers.get(question.id) ?? ''} ${match[2]}`.trim())
    }
    return answers
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
}

function evaluate(scenario: Scenario, mode: Mode): { score: number; failed: string[] } {
  const briefing = briefingFor(scenario)
  // Briefing mode only asks whether the facts are there to be found; forbidden claims are about answers.
  const answers = mode === 'claude' ? askClaude(briefing, scenario.questions) : null
  const failed = scenario.questions.filter((question) => {
    if (!answers) {
      const section = sectionOf(briefing, question.section)
      return !question.inBriefing.every((pattern) => pattern.test(section)) || (question.notInBriefing ?? []).some((pattern) => pattern.test(section))
    }
    return !passes(question, answers.get(question.id) ?? '')
  })
  return { score: (scenario.questions.length - failed.length) / scenario.questions.length, failed: failed.map((question) => `${question.id}: ${question.ask}${answers ? ` → ${answers.get(question.id) ?? '(no answer)'}` : ''}`) }
}

const args = process.argv.slice(2)
const mode: Mode = args.includes('--agent') && args[args.indexOf('--agent') + 1] === 'claude' ? 'claude' : 'briefing'
let regressed = false
for (const scenario of SCENARIOS) {
  const { score, failed } = evaluate(scenario, mode)
  // The deterministic mode has no excuse for missing anything.
  const mark = mode === 'briefing' && score < 1 ? 'MISSING' : 'ok'
  if (mark === 'MISSING') regressed = true
  console.log(`${mark.padEnd(9)} ${(score * 100).toFixed(0).padStart(3)}%  ${scenario.name}`)
  for (const line of failed) console.log(`            missed ${line}`)
}

if (regressed) {
  console.error('\nA briefing no longer carries something a fresh agent needs (see "missed" above).')
  process.exit(1)
}
