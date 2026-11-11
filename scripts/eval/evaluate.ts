// The briefing evaluation's shared logic: what an agent is told, how its
// answers are scored, and the no-memory baseline the public benchmark compares
// against. `run.ts` is the CI check; `benchmark.ts` publishes the numbers.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectState, rankContext, recallFor, renderContext, renderHandoff, renderRecall, renderSearch, searchMemory, sinceYouLeft } from '../../packages/context/src/index'
import { ContextStore } from '../../packages/store/src/index'
import { EVAL_NOW, type Question, type Scenario } from './scenarios'

/** The same budget a real session start gets. */
const BRIEFING_CHARS = 6_000
const CLAUDE_TIMEOUT_MS = 180_000

export type Mode = 'briefing' | 'claude'
/** What the agent starts with: Continuum's briefing and tools, or only the repository as a fresh agent sees it. */
export type Condition = 'continuum' | 'none'

export interface Told {
  briefing: string
  /** What each question's tool call returns, by question id. */
  toolReplies: Map<string, string>
}

/** What the agent is told at session start, and what the tools some questions name would answer. */
export function toldFor(scenario: Scenario): Told {
  const store = ContextStore.open(':memory:')
  try {
    store.recordAll(scenario.events)
    const tree = { root: `/eval/${scenario.name.replace(/\W+/g, '-')}`, revision: 'e7a1c00', files: new Map(Object.entries(scenario.files)) }
    const { sessionId, agent } = scenario.resumingSession
    const state = projectState(store, tree, EVAL_NOW, { excludeSessionId: sessionId })
    const reply = ({ name, query }: NonNullable<Question['tool']>) => {
      if (name === 'search_memory') return renderSearch(searchMemory(store, state, query), query, EVAL_NOW)
      // Recall is what the prompt hook adds when someone types `query`; the scenario's files are the code as it is now.
      if (name === 'recall') return renderRecall(recallFor(store, query, new Map(Object.entries(scenario.files).map(([path, hash]) => [`file:${path}`, hash]))))
      return renderContext(rankContext(store, state, { now: EVAL_NOW, query }))
    }
    return {
      briefing: renderHandoff(state, { now: EVAL_NOW, maxChars: BRIEFING_CHARS, since: sinceYouLeft(store, agent, sessionId) }),
      toolReplies: new Map(scenario.questions.flatMap((question) => (question.tool ? [[question.id, reply(question.tool)] as const] : []))),
    }
  } finally {
    store.close()
  }
}

/** The text under a `## heading` that starts with `title`, or the whole briefing when no section is named. */
export function sectionOf(briefing: string, title: string | undefined): string {
  if (!title) return briefing
  const start = briefing.indexOf(`\n## ${title}`)
  if (start === -1) return ''
  const end = briefing.indexOf('\n## ', start + 4)
  return briefing.slice(start, end === -1 ? undefined : end)
}

/** Every expected pattern appears, and no forbidden one does. */
export function passes(question: Question, answer: string): boolean {
  return question.expect.every((pattern) => pattern.test(answer)) && !(question.forbid ?? []).some((pattern) => pattern.test(answer))
}

/**
 * What an agent without memory has at the start of a session: the repository
 * as it is now (its files) and its git history. No notes, checks, tasks or
 * decisions. It could go and look at the code, but the questions are about
 * what it knows before it starts.
 */
export function baselineFor(scenario: Scenario): string {
  const commits = scenario.events.flatMap((event) => (event.type === 'commit.recorded' && !event.payload.baseline ? [`${event.payload.hash.slice(0, 7)} ${event.payload.message}`] : [])).reverse()
  return [
    'You have no notes from earlier sessions and no project memory.',
    `Files in the repository: ${Object.keys(scenario.files).sort().join(', ')}.`,
    commits.length > 0 ? `Git history, newest first:\n${commits.join('\n')}` : 'Git history: nothing beyond the files above.',
  ].join('\n')
}

export interface Asked {
  answers: Map<string, string>
  /** The model that answered, as the claude CLI reports it. */
  model: string
}

/** Asks Claude, through the claude CLI in an empty directory, to answer from what it was given alone. */
export function askClaude(told: Told | { baseline: string }, questions: readonly Question[]): Asked {
  const given = 'baseline' in told ? ['<repository>', told.baseline, '</repository>'] : ['<briefing>', told.briefing, '</briefing>']
  const asked =
    'baseline' in told
      ? []
      : questions.flatMap((question) => {
          const reply = told.toolReplies.get(question.id)
          return question.tool && reply ? ['', `You called ${question.tool.name} with the query "${question.tool.query}" and it returned:`, '<tool-reply>', reply, '</tool-reply>'] : []
        })
  const prompt = [
    'You are starting work on a software project. Below is the only information you have about it.',
    'Answer each question in one or two sentences, on its own line, starting with its number and a period. If you cannot know, say so.',
    '',
    ...given,
    ...asked,
    '',
    ...questions.map((question, index) => `${index + 1}. ${question.ask}`),
  ].join('\n')
  const empty = mkdtempSync(join(tmpdir(), 'continuum-eval-'))
  try {
    const reply = JSON.parse(execFileSync('claude', ['-p', prompt, '--output-format', 'json'], { cwd: empty, encoding: 'utf8', timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })) as { result?: string; modelUsage?: Record<string, unknown> }
    const answers = new Map<string, string>()
    for (const match of (reply.result ?? '').matchAll(/^\s*(\d+)\.\s*(.+)$/gm)) {
      const question = questions[Number(match[1]) - 1]
      if (question) answers.set(question.id, `${answers.get(question.id) ?? ''} ${match[2]}`.trim())
    }
    return { answers, model: Object.keys(reply.modelUsage ?? {})[0] ?? 'unknown' }
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
}

export interface Evaluated {
  score: number
  passed: number
  total: number
  failed: string[]
  model: string | null
}

export function evaluate(scenario: Scenario, mode: Mode, condition: Condition = 'continuum'): Evaluated {
  const told = toldFor(scenario)
  // Briefing mode only asks whether the facts are there to be found; forbidden claims are about answers.
  const asked = mode === 'claude' ? askClaude(condition === 'none' ? { baseline: baselineFor(scenario) } : told, scenario.questions) : null
  const answers = asked?.answers ?? null
  const failed = scenario.questions.filter((question) => {
    if (!answers) {
      const section = question.tool ? (told.toolReplies.get(question.id) ?? '') : sectionOf(told.briefing, question.section)
      return !question.inBriefing.every((pattern) => pattern.test(section)) || (question.notInBriefing ?? []).some((pattern) => pattern.test(section))
    }
    return !passes(question, answers.get(question.id) ?? '')
  })
  const total = scenario.questions.length
  return {
    score: (total - failed.length) / total,
    passed: total - failed.length,
    total,
    failed: failed.map((question) => `${question.id}: ${question.ask}${answers ? ` → ${answers.get(question.id) ?? '(no answer)'}` : ''}`),
    model: asked?.model ?? null,
  }
}

