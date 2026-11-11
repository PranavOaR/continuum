// Briefing quality evaluation.
//
//   npm run eval                        # is every answer in the briefing? (deterministic, free, run in CI)
//   npm run eval -- --agent claude      # ask Claude the questions from the briefing alone (uses your account)
//   npm run eval -- --agent claude --context none   # the same, with no memory: the baseline
//
// Briefing mode must score 100%: every answer is in its section in exactly the
// expected words, and no section makes a misleading claim. Questions that name
// a tool (search_memory, get_context with a query, recall) are checked against
// that tool's reply instead. CI runs it. `npm run bench:handoff` runs both
// conditions with Claude and publishes the results.
import { evaluate, type Condition, type Mode } from './evaluate'
import { SCENARIOS } from './scenarios'

const args = process.argv.slice(2)
const mode: Mode = args.includes('--agent') && args[args.indexOf('--agent') + 1] === 'claude' ? 'claude' : 'briefing'
const condition: Condition = args.includes('--context') && args[args.indexOf('--context') + 1] === 'none' ? 'none' : 'continuum'
let regressed = false
for (const scenario of SCENARIOS) {
  const { score, failed } = evaluate(scenario, mode, condition)
  // The deterministic mode has no excuse for missing anything.
  const mark = mode === 'briefing' && score < 1 ? 'MISSING' : 'ok'
  if (mark === 'MISSING') regressed = true
  console.log(`${mark.padEnd(9)} ${(score * 100).toFixed(0).padStart(3)}%  ${scenario.name}`)
  for (const line of failed) console.log(`            missed ${line}`)
}

if (regressed) {
  console.error('\nA briefing or tool reply no longer carries something a fresh agent needs (see "missed" above).')
  process.exit(1)
}
