import { Navigate, type RouteObject } from 'react-router-dom'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { RouteError } from '../app/RouteError'

/** The public website: the landing page only. Old /app links (the former demo) go home. */
export const SITE_ROUTES: RouteObject[] = [
  { path: '/', element: <LandingPage />, errorElement: <RouteError /> },
  { path: '/app/*', element: <Navigate to="/" replace /> },
  { path: '*', element: <NotFoundPage /> },
]
