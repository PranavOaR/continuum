import { ChevronRight, FileCode2 } from 'lucide-react'
import { useState } from 'react'
import { useTimeFormat } from '../../hooks/useTimeFormat'
import type { ProjectFile } from '@continuum/core'
import { matchesQuery } from '../../utils/search'
import { SearchInput } from '../shared/Fields'
import { Panel } from '../shared/Panel'
import { EmptyState } from '../shared/States'
import { ChangeTypeBadge, FileStatusBadge } from '../shared/StatusBadge'

interface FileExplorerProps {
  files: ProjectFile[]
  onOpenFile: (fileId: string) => void
}

export function FileExplorer({ files, onOpenFile }: FileExplorerProps) {
  const [query, setQuery] = useState('')
  const format = useTimeFormat()
  const visible = files.filter((file) => matchesQuery(query, file.path))

  return (
    <Panel
      id="files"
      title="File changes"
      description="Files associated with the selected task, as recorded in the demo dataset."
      actions={<SearchInput value={query} onChange={setQuery} label="Filter files by path" placeholder="Filter by path" className="w-44 sm:w-56" />}
      bodyClassName="p-0"
    >
      {files.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<FileCode2 />} title="No file changes recorded" description="This task has no associated file changes yet." />
        </div>
      ) : visible.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No files match" description={`No file path contains “${query}”.`} />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((file) => (
            <li key={file.id}>
              <button type="button" onClick={() => onOpenFile(file.id)} className="group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                <FileCode2 className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12.5px] break-all text-fg">{file.path}</span>
                    <ChangeTypeBadge type={file.changeType} />
                    <FileStatusBadge status={file.status} />
                  </span>
                  <span className="mt-1 block text-[12.5px] text-muted">{file.relevance}</span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-subtle">
                    {file.revision && <span className="font-mono">rev {file.revision}</span>}
                    <span>
                      <span className="text-success">+{file.additions}</span> <span className="text-danger">−{file.deletions}</span>
                    </span>
                    <span>observed {format(file.updatedAt)}</span>
                  </span>
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-subtle group-hover:text-fg" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
