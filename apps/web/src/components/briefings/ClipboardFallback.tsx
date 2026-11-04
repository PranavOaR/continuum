import { Dialog } from '../shared/Dialog'

/** Shown when the browser refuses clipboard access, so the text can still be copied by hand. */
export function ClipboardFallback({ text, reason, onClose }: { text: string | null; reason: string; onClose: () => void }) {
  return (
    <Dialog open={text !== null} onClose={onClose} title="Copy manually" description={`Clipboard access failed: ${reason}`} size="lg">
      <label htmlFor="briefing-fallback" className="mb-2 block text-[12px] text-muted">
        Select the text below and copy it with your keyboard.
      </label>
      <textarea
        id="briefing-fallback"
        readOnly
        value={text ?? ''}
        onFocus={(event) => event.currentTarget.select()}
        rows={16}
        className="w-full rounded-md border border-line-strong bg-bg p-3 font-mono text-[12px] text-fg"
      />
    </Dialog>
  )
}
