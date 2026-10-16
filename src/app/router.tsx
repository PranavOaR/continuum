import { lazy, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { OverviewPage } from '../pages/OverviewPage'
import { RouteError } from './RouteError'

/** Code-split secondary routes; the landing page and overview load eagerly for an instant first view. */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const ProjectsPage = lazyPage(() => import('../pages/ProjectsPage'), 'ProjectsPage')
const ProjectWorkspacePage = lazyPage(() => import('../pages/ProjectWorkspacePage'), 'ProjectWorkspacePage')
const ActivityPage = lazyPage(() => import('../pages/ActivityPage'), 'ActivityPage')
const MemoryPage = lazyPage(() => import('../pages/MemoryPage'), 'MemoryPage')
const HandoffsPage = lazyPage(() => import('../pages/HandoffsPage'), 'HandoffsPage')
const HandoffPreviewPage = lazyPage(() => import('../pages/HandoffPreviewPage'), 'HandoffPreviewPage')
const SettingsPage = lazyPage(() => import('../pages/SettingsPage'), 'SettingsPage')

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage />, errorElement: <RouteError /> },
  {
    path: '/app',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectWorkspacePage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'memory', element: <MemoryPage /> },
      { path: 'handoffs', element: <HandoffsPage /> },
      { path: 'handoffs/:handoffId', element: <HandoffPreviewPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage inApp /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
