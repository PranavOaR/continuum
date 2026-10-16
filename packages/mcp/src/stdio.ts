import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createContinuumServer, type ServerOptions } from './server'

/** Serves over stdin/stdout until the client disconnects. Nothing else may write to stdout. */
export async function serveStdio(options: ServerOptions): Promise<void> {
  const server = createContinuumServer(options)
  const transport = new StdioServerTransport()
  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => resolve()
  })
  await server.connect(transport)
  await closed
}
