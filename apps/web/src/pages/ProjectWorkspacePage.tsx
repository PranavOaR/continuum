import { Activity } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { ActivityTimeline } from '../components/activity/ActivityTimeline'
import { EventDetailDrawer } from '../components/activity/EventDetailDrawer'
import { FileDetailDrawer } from '../components/projects/FileDetailDrawer'
import { FileExplorer } from '../components/projects/FileExplorer'
import { LeftOffPanel } from '../components/projects/LeftOffPanel'
import { MemoryPanel } from '../components/projects/MemoryPanel'
import { ProjectHeader } from '../components/projects/ProjectHeader'
import { TaskPanel } from '../components/projects/TaskPanel'
import { VerificationPanel } from '../components/projects/VerificationPanel'
import { ButtonLink } from '../components/shared/Button'
import { Panel } from '../components/shared/Panel'
import { EmptyState, ErrorState, LoadingBlock, Skeleton } from '../components/shared/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useWorkspace } from '../hooks/useWorkspace'
import type { ProjectWorkspace } from '../services'
import { useUI } from '../state/ui'
import type { ProjectTask } from '@continuum/core'

function resolveTask(workspace: ProjectWorkspace, requestedId: string | null): ProjectTask | undefined {
  return (
    workspace.tasks.find((task) => task.id === requestedId) ??
    workspace.tasks.find((task) => task.id === workspace.project.currentTaskId) ??
    workspace.tasks[0]
  )
}

/** Scrolls to the URL hash (e.g. #verification) once the target section has rendered. */
function useScrollToHash(isReady: boolean) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!isReady || !hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [isReady, hash])
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <LoadingBlock rows={4} label="Loading project" />
        <LoadingBlock rows={3} />
      </div>
    </div>
  )
}

export function ProjectWorkspacePage() {
  const { projectId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: workspace, error, isLoading } = useWorkspace(projectId)
  const { openHandoffDialog } = useUI()
  useDocumentTitle(workspace?.project.name ?? 'Project')
  useScrollToHash(workspace !== undefined)

  const setParam = (changes: Record<string, string | null>) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        Object.entries(changes).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)))
        return next
      },
      { replace: true },
    )

  if (isLoading) return <WorkspaceSkeleton />
  if (error || !workspace) {
    return (
      <ErrorState
        title="Project not found"
        description={error?.message ?? 'This project could not be found.'}
        action={<ButtonLink to="/app/projects">Back to projects</ButtonLink>}
      />
    )
  }

  const { project, tasks, files, events, verification, memory } = workspace
  const task = resolveTask(workspace, searchParams.get('task'))
  const selectedFile = files.find((file) => file.id === searchParams.get('file'))
  const selectedEvent = events.find((event) => event.id === searchParams.get('event'))
  const status = tasks.find((candidate) => candidate.id === project.currentTaskId)?.status ?? 'idle'

  // Without a recorded task, show everything recorded for the project rather than a dead end.
  const taskFiles = task ? files.filter((file) => task.relatedFileIds.includes(file.id)) : files
  const taskEvents = task
    ? events.filter((event) => event.taskId === task.id).toReversed()
    : events.toSorted((a, b) => a.timestamp.localeCompare(b.timestamp))
  const taskVerification = task ? verification.filter((record) => task.verificationIds.includes(record.id)) : verification
  const taskMemory = task ? memory.filter((record) => record.taskId === task.id) : memory
  const latestRevision = taskFiles.find((file) => file.revision)?.revision

  return (
    <>
      <ProjectHeader project={project} status={status} taskId={task?.id} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {task ? (
            <TaskPanel
              tasks={tasks}
              task={task}
              currentTaskId={project.currentTaskId}
              verification={verification}
              onSelectTask={(taskId) => setParam({ task: taskId, file: null })}
              onPrepareHandoff={() => openHandoffDialog({ projectId: project.id, taskId: task.id })}
            />
          ) : (
            <LeftOffPanel sessions={workspace.sessions} />
          )}
          <FileExplorer files={taskFiles} onOpenFile={(fileId) => setParam({ file: fileId })} />
          <Panel
            id="timeline"
            title="Agent activity"
            description={task ? 'Recorded work events for this task, oldest first.' : 'Recorded work events for this project, oldest first.'}
            actions={
              <Link to={`/app/activity?project=${project.id}`} className="text-[12px] text-accent hover:underline">
                All project activity
              </Link>
            }
          >
            {taskEvents.length === 0 ? (
              <EmptyState icon={<Activity />} title="No activity recorded" description="No events are linked to this task yet." />
            ) : (
              <ActivityTimeline events={taskEvents} onSelect={(eventId) => setParam({ event: eventId })} showClock />
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <VerificationPanel records={taskVerification} currentRevision={latestRevision} />
          <MemoryPanel records={taskMemory} projectId={project.id} />
        </div>
      </div>

      <FileDetailDrawer
        file={selectedFile}
        task={tasks.find((candidate) => candidate.id === selectedFile?.taskId)}
        decisions={memory.filter((record) => selectedFile?.decisionIds.includes(record.id))}
        onClose={() => setParam({ file: null })}
        onSelectTask={(taskId) => setParam({ task: taskId, file: null })}
      />
      <EventDetailDrawer
        event={selectedEvent}
        projectName={project.name}
        onClose={() => setParam({ event: null })}
        onOpenFile={(fileId) => setParam({ event: null, file: fileId })}
      />
    </>
  )
}
