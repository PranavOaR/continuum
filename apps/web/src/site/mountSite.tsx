import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { PreferencesProvider } from '../state/preferences'
import { SITE_ROUTES } from './siteRoutes'

/** continuumgroup.dev: the landing page, without the dashboard, its data services or the demo dataset. */
export function mount(rootElement: HTMLElement): void {
  createRoot(rootElement).render(
    <StrictMode>
      {/* The landing page's animations respect the visitor's "reduce motion" preference. */}
      <PreferencesProvider>
        <RouterProvider router={createBrowserRouter(SITE_ROUTES)} />
      </PreferencesProvider>
    </StrictMode>,
  )
}
