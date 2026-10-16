import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createContinuumServer, type ServerOptions } from './server'

export interface StdioStreams {
  stdin?: NodeJS.ReadableStream & { once(event: 'end' | 'close', listener: () => void): unknown }
  stdout?: NodeJS.WritableStream
}

/**
 * Serves over stdin/stdout until the client disconnects. Nothing else may write
 * to stdout. The SDK transport does not watch for end-of-input, so a client that
 * simply closes the pipe is detected here.
 */
export async function serveStdio(options: ServerOptions, streams: StdioStreams = {}): Promise<void> {
  const stdin = streams.stdin ?? process.stdin
  const server = createContinuumServer(options)
  const transport = new StdioServerTransport(stdin as never, (streams.stdout ?? process.stdout) as never)
  const closed = new Promise<void>((resolve) => {
    transport.onclose = () => resolve()
    stdin.once('end', resolve)
    stdin.once('close', resolve)
  })
  await server.connect(transport)
  await closed
  await server.close()
}
