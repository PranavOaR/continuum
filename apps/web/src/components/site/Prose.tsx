import { Fragment } from 'react'

/** Text with `backticked` spans rendered as inline code. */
export function Prose({ text }: { text: string }) {
  return text.split('`').map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.9em] whitespace-nowrap text-fg">
        {part}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}
