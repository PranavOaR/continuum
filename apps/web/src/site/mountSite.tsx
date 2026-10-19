import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { SITE_ROUTES } from './siteRoutes'

/** continuumgroup.dev: the landing page, without the dashboard, its data services or the demo dataset. */
export function mount(rootElement: HTMLElement): void {
  createRoot(rootElement).render(
    <StrictMode>
      <RouterProvider router={createBrowserRouter(SITE_ROUTES)} />
    </StrictMode>,
  )
}
