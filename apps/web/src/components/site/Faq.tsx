import { ChevronDown } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { FAQ } from './faqContent'
import { Eyebrow, SectionTitle } from './SectionHeading'

/** Text with `backticked` spans set as code. */
export function WithCode({ text }: { text: string }) {
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

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-t border-line py-24">
      <div className="mx-auto max-w-[1160px] px-4 sm:px-8">
        <Eyebrow index="06">FAQ</Eyebrow>
        <SectionTitle>Questions, answered.</SectionTitle>
        <div className="max-w-[820px] divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.question} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[17px] text-fg [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-5 text-[15px] leading-[1.65] text-muted">
                <WithCode text={item.answer} />
                {'link' in item && (
                  <>
                    {' '}
                    <Link to={item.link.to} className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
                      {item.link.label}
                    </Link>
                  </>
                )}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
