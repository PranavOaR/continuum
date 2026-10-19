import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { copyToClipboard } from '../../utils/clipboard'

const COPIED_MS = 2000

export function InstallCommand({ command }: { command: string }) {
  const [isCopied, setCopied] = useState(false)
  const copy = async () => {
    const result = await copyToClipboard(command)
    if (!result.ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), COPIED_MS)
  }
  return (
    <div className="flex w-full max-w-[560px] items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pr-1.5 pl-4">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[13.5px] break-words text-fg sm:whitespace-nowrap">
        <span aria-hidden className="mr-2 text-subtle select-none">$</span>
        {command}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] text-muted hover:bg-surface-2 hover:text-fg"
      >
        {isCopied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        <span aria-live="polite">{isCopied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}
