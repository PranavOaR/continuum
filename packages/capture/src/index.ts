export { CONTINUUM_DIR, currentBranch, findRepoRoot, gitPath, hashFiles, isIgnored, isRegularFileInRepo, isTracked, GitCommandError, headRevision, NotAGitRepositoryError, readWorkingTree, type WorkingTree } from './git'
export { diffSnapshots, recordedFiles, SCAN_SOURCE, scanRepository, type FileChange, type ScanOptions, type ScanResult, type SharedImport } from './scan'
export {
  importSharedEvents,
  parseSharedFile,
  readSharedRecords,
  SHARE_SOURCE,
  SHARED_FILE,
  SHARED_SOURCE,
  SharedFileError,
  sharedFileContent,
  sharedHashOf,
  shareEvent,
  sharedRecordOf,
  writeSharedRecords,
  type SharedRecord,
} from './shared'
export { CheckInterruptedError, CommandNotFoundError, coverage, finalizeTail, MAX_OUTPUT_TAIL_CHARS, RUN_SOURCE, runCheck, type RunCheckOptions, type RunCheckResult } from './runCheck'
export { DEFAULT_DEBOUNCE_MS, DEFAULT_MAX_WAIT_MS, DEFAULT_POLL_MS, DEFAULT_RECONCILE_MS, isIgnoredPath, startCapture, WatchUnavailableError, type CaptureHandle, type CaptureMode, type CaptureOptions } from './watch'
export { createRedactor, MAX_CUSTOM_PATTERN_CHARS, REDACTED, redactSecrets, redactWithCount, type Redactor } from './redact'
export { addGitExclude, excludeFromGit, includeInGit, initWorkspace, isInitialized, locateWorkspace, NotInitializedError, openWorkspace, removeGitExclude, STORE_FILE, type Workspace } from './workspace'
export { MAX_EXCERPT_LINES, MAX_PATCH_LINES, uncommittedChanges, type UncommittedDiff } from './diff'
export { CONFIG_FILE, DEFAULT_CONFIG, InvalidConfigError, readConfig, repositoryRedactor, updateConfig, type ContinuumConfig } from './config'
export { commitsSince, MAX_COMMITS_PER_SCAN, recordedHead, type CommitInfo } from './commits'
export { IGNORE_FILE, loadContinuumIgnore, UnreadableIgnoreFileError, type IgnorePredicate } from './continuumIgnore'
export { defaultConfigDir, forgetMissingRepositories, readRegistry, registerRepository, REGISTRY_FILE, unregisterRepository, type RegisteredRepository } from './registry'
export { ACTIVE_SESSION_FILE, claimActiveSession, clearActiveSession, readActiveSession, type ActiveSession } from './activeSession'
export { extractSymbols, parseSymbolRef, type SourceSymbol, type SymbolKind } from './symbols'
export { readSymbolHashes, readWorkingTreeWithSymbols, symbolHashesFrom } from './symbolHashes'
export { readStaged, type StagedChanges } from './staged'
export { readHookHealth, recordHookArrival, recordHookFailure, type HookHealth } from './hookHealth'
export { briefingPreferences, EMPTY_PROFILE, InvalidProfileError, PROFILE_FILE, readProfile, writeProfile } from './profile'
export { maskWithin, PATTERN_TIME_LIMIT_MS, patternProblem, previewRedaction, slowOn } from './patternCheck'
export { InvalidSettingsError, saveSettings } from './settings'
