import { existsSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRedactor, isInitialized, locateWorkspace, NotAGitRepositoryError, readConfig, type ContinuumConfig } from '@continuum/capture'
import { isContinuumPluginEnabled } from '@continuum/claude-code'
import { inspectStore, LATEST_SCHEMA_VERSION, type StoreInfo } from '@continuum/store'
import { runDoctor, type DoctorEnvironment, type Finding, type FindingStatus } from './doctor'
import { hookStatuses, type HookStatus } from './hookStatus'

/** Where people report problems: the public plugin repository hosts the issues. */
export const ISSUES_URL = 'https://github.com/PranavOaR/continuum-plugin/issues'

/**
 * GitHub refuses a link much longer than this, and a report with many
 * findings, once percent-encoded, can pass it.
 */
export const MAX_ISSUE_URL_CHARS = 7_000
/** The template in the plugin repository (plugin-repo/.github/ISSUE_TEMPLATE) with the same headings. */
const ISSUE_TEMPLATE = 'bug_report.md'
const PASTE_REPORT = 'Run `npx getcontinuum doctor --report` in the project and paste what it prints here.'

const issueBody = (report: string) =>
  ['### What happened', '', '<!-- What you did, what you expected, and what happened instead. -->', '', '### Diagnostic report', '', report, ''].join('\n')

const newIssueUrl = (body: string) => `${ISSUES_URL}/new?${new URLSearchParams({ template: ISSUE_TEMPLATE, body: issueBody(body) }).toString()}`

/**
 * A link that opens a new issue with `report` already in it. Following it
 * shows the report to GitHub and nobody else; nothing is posted until the
 * person submits the form. A report too long for a link is asked for instead.
 */
export function issueUrl(report: string): string {
  const filled = newIssueUrl(report)
  return filled.length <= MAX_ISSUE_URL_CHARS ? filled : newIssueUrl(PASTE_REPORT)
}

const MARKS: Record<FindingStatus, string> = { ok: '✓', warn: '!', fail: '✗' }
const KIB = 1024
const MIB = KIB * KIB

type Unreadable = { error: string }
const isUnreadable = (value: object): value is Unreadable => 'error' in value

export interface RepositoryFacts {
  store: (StoreInfo & { latestSchemaVersion: number; bytes: number }) | Unreadable
  settings: ContinuumConfig | Unreadable
  hooks: HookStatus[]
}

/** Everything the report says: versions, settings and counts, never recorded content. */
export interface ReportInput {
  version: string
  nodeVersion: string
  platform: string
  arch: string
  installedAs: string
  /** Null outside a repository, where project settings cannot be read. */
  pluginEnabled: boolean | null
  generatedAt: Date
  findings: Finding[]
  /** Null when doctor ran outside a repository where Continuum is set up. */
  repository: RepositoryFacts | null
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Shortens the repository to <repo> and the home folder to ~ (so neither a
 * user name nor a project name is shared), then masks secrets with the
 * built-in rules and the repository's own patterns.
 */
export function pathScrubber(options: { roots: readonly string[]; home: string; patterns?: readonly string[] }): (text: string) => string {
  const { redact } = createRedactor(options.patterns ?? [])
  const replacements: [RegExp, string][] = [
    // Longest first, so /private/var/… is replaced before /var/….
    ...[...new Set(options.roots)].sort((a, b) => b.length - a.length).map((root): [RegExp, string] => [new RegExp(escapeRegExp(root), 'g'), '<repo>']),
    [new RegExp(escapeRegExp(options.home), 'g'), '~'],
  ]
  return (text) => redact(replacements.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text))
}

function formatBytes(bytes: number): string {
  if (bytes < KIB) return `${bytes} B`
  if (bytes < MIB) return `${(bytes / KIB).toFixed(1)} KB`
  return `${(bytes / MIB).toFixed(1)} MB`
}

function findingLines(finding: Finding): string[] {
  const line = `- ${MARKS[finding.status]} ${finding.label}${finding.detail ? ` (${finding.detail})` : ''}`
  return finding.fix && finding.status !== 'ok' ? [line, `  - Fix: ${finding.fix}`] : [line]
}

function storeLines(store: RepositoryFacts['store']): string[] {
  if (isUnreadable(store)) return [`- Store: could not be read (${store.error})`]
  const types = Object.entries(store.eventTypes).sort(([a], [b]) => a.localeCompare(b))
  return [
    `- Store: schema ${store.schemaVersion} of ${store.latestSchemaVersion}, ${store.events} event${store.events === 1 ? '' : 's'}, ${formatBytes(store.bytes)}, last activity ${store.lastActivity ?? 'never'}`,
    ...(types.length > 0 ? [`- Events: ${types.map(([type, count]) => `${type} ${count}`).join(', ')}`] : []),
  ]
}

function settingsLine(settings: RepositoryFacts['settings']): string {
  if (isUnreadable(settings)) return `- Settings: could not be read (${settings.error})`
  const patterns = settings.redactPatterns.length
  // The patterns themselves can name customers or ticket formats, so only their number is shared.
  return `- Settings: agent checks ${settings.agentChecks ? 'on' : 'off'}, prompts ${settings.capturePrompts ? 'on' : 'off'}, receipts ${settings.receipts ? 'on' : 'off'}, ${patterns} redaction pattern${patterns === 1 ? '' : 's'}`
}

function hookLine({ name, health }: HookStatus): string {
  const arrived = health.lastArrivalAt ? `last arrived ${health.lastArrivalAt}` : 'never arrived'
  const failure = health.lastFailure
  if (!failure) return `- ${name} hooks: ${arrived}, no failure recorded`
  return `- ${name} hooks: ${arrived}, ${health.isFailing ? `FAILING since ${failure.at}` : `last failed ${failure.at}`}: ${failure.message}`
}

function repositoryLines(repository: RepositoryFacts | null): string[] {
  if (!repository) return ['No Continuum repository here: run `continuum doctor --report` inside the project to include it.']
  const hooks = repository.hooks.length > 0 ? repository.hooks.map(hookLine) : ['- Hooks: none connected or recorded']
  return [...storeLines(repository.store), settingsLine(repository.settings), ...hooks]
}

/** The report as Markdown, ready to paste into a GitHub issue. Every line goes through `scrub`. */
export function renderReport(input: ReportInput, scrub: (text: string) => string): string {
  const plugin = input.pluginEnabled === null ? 'unknown' : input.pluginEnabled ? 'enabled' : 'not enabled'
  const lines = [
    '## Continuum diagnostic report',
    '',
    `Generated ${input.generatedAt.toISOString()} by \`continuum doctor --report\`. It holds versions, settings, counts and diagnostics: no file contents, prompts, tasks or decisions. The repository is shortened to \`<repo>\`, your home folder to \`~\`, and secrets are masked. Read it before you share it.`,
    '',
    '### Environment',
    `- Continuum: ${input.version}`,
    `- Node.js: ${input.nodeVersion}`,
    `- Platform: ${input.platform} ${input.arch}`,
    `- Installed as: \`${input.installedAs}\``,
    `- Claude Code plugin: ${plugin}`,
    '',
    '### Doctor',
    ...input.findings.flatMap(findingLines),
    '',
    '### Repository',
    ...repositoryLines(input.repository),
    '',
    `Report problems at ${ISSUES_URL}`,
  ]
  return lines.map(scrub).join('\n')
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The store's size on disk, including its write-ahead log. */
function storeBytes(storePath: string): number {
  return [storePath, `${storePath}-wal`].filter((path) => existsSync(path)).reduce((total, path) => total + statSync(path).size, 0)
}

function readStore(storePath: string): RepositoryFacts['store'] {
  try {
    return { ...inspectStore(storePath), latestSchemaVersion: LATEST_SCHEMA_VERSION, bytes: storeBytes(storePath) }
  } catch (error) {
    return { error: messageOf(error) }
  }
}

async function readSettings(root: string): Promise<RepositoryFacts['settings']> {
  try {
    return await readConfig(root)
  } catch (error) {
    return { error: messageOf(error) }
  }
}

/** The repository Continuum is set up in at `cwd`, or null outside one. */
async function setUpWorkspace(cwd: string) {
  try {
    const workspace = await locateWorkspace(cwd)
    return isInitialized(workspace) ? workspace : null
  } catch (error) {
    if (error instanceof NotAGitRepositoryError) return null
    throw error
  }
}

const realpathOr = (path: string) => (existsSync(path) ? realpathSync.native(path) : path)

/** Runs doctor and gathers what the report shows, then renders it scrubbed. */
export async function buildReport(env: DoctorEnvironment & { version: string; arch: string; home?: string }): Promise<string> {
  const [findings, workspace] = await Promise.all([runDoctor(env), setUpWorkspace(env.cwd)])
  const repository: RepositoryFacts | null = workspace
    ? { store: readStore(workspace.storePath), settings: await readSettings(workspace.root), hooks: await hookStatuses(workspace.root) }
    : null
  const input: ReportInput = {
    version: env.version,
    nodeVersion: env.nodeVersion,
    platform: env.platform,
    arch: env.arch,
    installedAs: [env.invocation.command, ...env.invocation.args].join(' '),
    pluginEnabled: workspace ? await isContinuumPluginEnabled(workspace.root, env.claudeConfigDir) : null,
    generatedAt: env.now ?? new Date(),
    findings,
    repository,
  }
  const settings = repository?.settings
  const scrub = pathScrubber({
    roots: workspace ? [workspace.root, realpathOr(workspace.root)] : [],
    home: env.home ?? homedir(),
    patterns: settings && !isUnreadable(settings) ? settings.redactPatterns : [],
  })
  return renderReport(input, scrub)
}
