// Imported first by bin.ts, before anything loads node:sqlite: Node 22 marks
// it experimental and would print that on every command and hook. Every
// other warning still goes through.
const emitWarning = process.emitWarning.bind(process)

process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning.message
  const type = typeof rest[0] === 'string' ? rest[0] : (rest[0] as { type?: string } | undefined)?.type
  if (type === 'ExperimentalWarning' && message.startsWith('SQLite is an experimental feature')) return
  emitWarning(warning as string, ...(rest as []))
}) as typeof process.emitWarning
