import type { ReactNode } from 'react'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { MemoryRecord, ProjectFile, ProjectTask } from '@continuum/core'
import { cn } from '../../utils/cn'
import { useIsLive } from '../../state/dataMode'
import { MEMORY_KIND_LABEL } from '@continuum/core'
import { Dialog } from '../shared/Dialog'
import { hasLineDetail } from './fileDetail'
import { ChangeTypeBadge, EvidenceBadge, FileStatusBadge } from '../shared/StatusBadge'

interface FileDetailDrawerProps {
  file: ProjectFile | undefined
  task: ProjectTask | undefined
  decisions: MemoryRecord[]
  onClose: () => void
  onSelectTask: (taskId: string) => void
}

const DIFF_TITLE: Record<ProjectFile['diffSource'], string> = {
  illustrative: 'Illustrative diff excerpt',
  uncommitted: 'Uncommitted changes (against the last commit)',
  none: 'Diff',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 label-mono text-muted ">{title}</h3>
      {children}
    </section>
  )
}

const DIFF_STYLE = {
  add: { row: 'bg-success/10 text-fg', marker: '+', markerClass: 'text-success' },
  remove: { row: 'bg-danger/10 text-fg', marker: '−', markerClass: 'text-danger' },
  context: { row: 'text-muted', marker: ' ', markerClass: '' },
}

export function FileDetailDrawer({ file, task, decisions, onClose, onSelectTask }: FileDetailDrawerProps) {
  const isLive = useIsLive()
  const format = useTimeFormat()

  return (
    <Dialog
      open={file !== undefined}
      onClose={onClose}
      variant="drawer"
      title={<span className="font-mono text-[14px] break-all">{file?.path}</span>}
      description="File change details"
    >
      {file && (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            <ChangeTypeBadge type={file.changeType} />
            <FileStatusBadge status={file.status} />
            <EvidenceBadge type={file.evidenceType} />
          </div>

          <Section title="Change metadata">
            <dl className="grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="label-mono text-subtle">Revision</dt>
                <dd className="font-mono text-[12px] text-fg">{file.revision ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="label-mono text-subtle">Last observed</dt>
                <dd className="text-fg">{format(file.updatedAt)}</dd>
              </div>
              <div>
                <dt className="label-mono text-subtle">{file.diffSource === 'uncommitted' ? 'Lines since last commit' : 'Lines'}</dt>
                <dd>
                  {hasLineDetail(file) ? (
                    <>
                      <span className="text-success">+{file.additions}</span> <span className="text-danger">−{file.deletions}</span>
                    </>
                  ) : (
                    <span className="text-subtle">{isLive ? 'No uncommitted change' : 'Not captured yet'}</span>
                  )}
                </dd>
              </div>
            </dl>
          </Section>

          <Section title="Change summary">
            <p className="text-[13px] text-fg">{file.summary}</p>
            <p className="mt-2 text-[13px] text-muted">{file.relevance}</p>
          </Section>

          <Section title="Related task">
            {task ? (
              <button type="button" onClick={() => onSelectTask(task.id)} className="text-left text-[13px] text-accent hover:underline">
                {task.title}
              </button>
            ) : (
              <p className="text-[13px] text-subtle">Not linked to a task.</p>
            )}
          </Section>

          <Section title="Related symbols">
            {file.symbols.length === 0 ? (
              <p className="text-[13px] text-subtle">No symbols recorded for this file.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {file.symbols.map((symbol) => (
                  <li key={symbol.name} className="rounded border border-line px-2 py-0.5 font-mono text-[12px] text-fg">
                    {symbol.name}
                    <span className="ml-1.5 text-subtle">{symbol.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Related decisions">
            {decisions.length === 0 ? (
              <p className="text-[13px] text-subtle">No decisions reference this file.</p>
            ) : (
              <ul className="space-y-2">
                {decisions.map((decision) => (
                  <li key={decision.id} className="rounded-md border border-line p-2.5">
                    <p className="text-[11px] text-muted">{MEMORY_KIND_LABEL[decision.kind]}</p>
                    <p className="text-[13px] text-fg">{decision.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {file.diff.length === 0 ? (
            <Section title="Diff">
              <p className="text-[12.5px] text-muted">
                {isLive
                  ? 'No uncommitted change in this file: it matches the last commit. Continuum records changes by content hash and does not store file contents, so earlier versions are in your git history.'
                  : 'Line-level diffs are not captured yet. The change is recorded by its content hash; run git diff to see it.'}
              </p>
            </Section>
          ) : (
          <Section title={DIFF_TITLE[file.diffSource]}>
            <pre className="overflow-x-auto rounded-md border border-line bg-bg py-2 font-mono text-[11.5px] leading-relaxed">
              {file.diff.map((line, index) => (
                <div key={index} className={cn('px-3 whitespace-pre', DIFF_STYLE[line.kind].row)}>
                  <span aria-hidden className={cn('mr-3 inline-block w-2 select-none', DIFF_STYLE[line.kind].markerClass)}>
                    {DIFF_STYLE[line.kind].marker}
                  </span>
                  {line.text}
                </div>
              ))}
            </pre>
            {file.diffTruncated && <p className="mt-2 text-[11px] text-subtle">Excerpt shortened; run git diff for the full change.</p>}
            {file.diffSource === 'illustrative' && <p className="mt-2 text-[11px] text-subtle">Mock excerpt for demonstration. Not read from a live repository.</p>}
          </Section>
          )}
        </>
      )}
    </Dialog>
  )
}
