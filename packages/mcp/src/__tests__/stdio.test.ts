import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { serveStdio } from '../stdio'

describe('serveStdio', () => {
  it('answers over the streams and returns once the client closes its end', async () => {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const replies: string[] = []
    stdout.on('data', (chunk: Buffer) => replies.push(chunk.toString()))
    const serving = serveStdio({ cwd: '/', version: '0.0.0-test' }, { stdin, stdout })
    stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 50))
    stdin.end()
    await expect(serving).resolves.toBeUndefined()
    expect(JSON.parse(replies.join('').split('\n')[0])).toMatchObject({ id: 1, result: { serverInfo: { name: 'continuum' } } })
  })
})
