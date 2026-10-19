import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import { RouteError } from '../app/RouteError'
import { LandingPage } from '../pages/LandingPage'
import { SiteNotFoundPage } from '../pages/SiteNotFoundPage'

// Loaded only when visited, so the home page does not carry the Markdown renderer.
const DocsPage = lazy(() => import('../pages/DocsPage').then((module) => ({ default: module.DocsPage })))
const PrivacyPage = lazy(() => import('../pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })))

const later = (page: ReactNode) => <Suspense fallback={<div className="min-h-dvh bg-bg" />}>{page}</Suspense>
const error = <RouteError isSite />

/** The public website. Old /app links (the former demo) go home. */
export const SITE_ROUTES: RouteObject[] = [
  { path: '/', element: <LandingPage />, errorElement: error },
  { path: '/docs', element: later(<DocsPage />), errorElement: error },
  { path: '/docs/:slug', element: later(<DocsPage />), errorElement: error },
  { path: '/privacy', element: later(<PrivacyPage />), errorElement: error },
  { path: '/app/*', element: <Navigate to="/" replace /> },
  { path: '*', element: <SiteNotFoundPage /> },
]
