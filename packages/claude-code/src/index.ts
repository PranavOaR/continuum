export { editedFiles, editedPath, FILE_EDIT_TOOLS, hookPayloadSchema, InvalidHookPayloadError, parseHookPayload, patchedFiles, PATCH_TOOL, VSCODE_EDIT_TOOLS, VSCODE_RECORDED_TOOLS, withVsCodeDefaults, type EditedFile, type HookAgent, type HookPayload } from './hookPayload'
export { ingestHook, SESSION_START_CONTEXT_CHARS, type IngestOptions, type IngestOutcome } from './ingest'
export { ADAPTER_SOURCE, adapterSource, MAX_NOTE_CHARS, translateHook, type FileEdit, type TranslateContext } from './translate'
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
export { CODEX_CONFIG_FILE, CODEX_HOOKS_FILE, removeCodexSetup, setupCodex } from './codexSetup'
export { CURSOR_MCP_FILE, CURSOR_RULE_FILE, removeCursorSetup, setupCursor } from './cursorSetup'
export { guardedPluginHooks, PLUGIN_BUNDLE, pluginMcpServers } from './plugin'
export { removeVsCodeSetup, setupVsCode, VSCODE_HOOKS_FILE, VSCODE_INSTRUCTIONS_FILE, VSCODE_MCP_FILE } from './vscodeSetup'
