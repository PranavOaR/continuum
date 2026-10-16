export { editedPath, FILE_EDIT_TOOLS, hookPayloadSchema, InvalidHookPayloadError, parseHookPayload, type HookPayload } from './hookPayload'
export { ingestHook, SESSION_START_CONTEXT_CHARS, type IngestOptions, type IngestOutcome } from './ingest'
export { ADAPTER_SOURCE, MAX_NOTE_CHARS, translateHook, type FileEdit, type TranslateContext } from './translate'
export {
  GIT_EXCLUDE_COMMENT,
  HOOK_EVENTS,
  HOOKS_FILE,
  isContinuumHandler,
  isContinuumServer,
  MCP_FILE,
  MCP_SERVER_NAME,
  removeClaudeCodeSetup,
  SetupError,
  setupClaudeCode,
  type FileAction,
  type Invocation,
  type SetupResult,
} from './setup'
