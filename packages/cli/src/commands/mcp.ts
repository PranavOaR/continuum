import { serveStdio } from '@continuum/mcp'
import { EXIT_OK, type Io } from '../io'

/** Serves the MCP protocol on stdio. stdout belongs to the protocol, so this command prints nothing itself. */
export async function mcpCommand(io: Io, version: string): Promise<number> {
  await serveStdio({ cwd: io.cwd, version, now: io.now })
  return EXIT_OK
}
