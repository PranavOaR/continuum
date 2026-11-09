import { Suspense, type ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import { RouteError } from '../app/RouteError'
import { LandingPage } from '../pages/LandingPage'
import { DocsPage, PrivacyPage } from './lazyPages'
import { SiteNotFoundPage } from '../pages/SiteNotFoundPage'


const later = (page: ReactNode) => <Suspense fallback={<div className="min-h-dvh bg-bg" />}>{page}</Suspense>
const error = <RouteError isSite />

/** The website's pages besides home: the docs and the privacy page, which the dashboard's development build serves too. */
export const SITE_PAGES: RouteObject[] = [
  { path: '/docs', element: later(<DocsPage />), errorElement: error },
  { path: '/docs/:slug', element: later(<DocsPage />), errorElement: error },
  { path: '/privacy', element: later(<PrivacyPage />), errorElement: error },
]

/** The public website. Old /app links (the former demo) go home. */
export const SITE_ROUTES: RouteObject[] = [
  { path: '/', element: <LandingPage />, errorElement: error },
  ...SITE_PAGES,
  { path: '/app/*', element: <Navigate to="/" replace /> },
  { path: '*', element: <SiteNotFoundPage /> },
]
