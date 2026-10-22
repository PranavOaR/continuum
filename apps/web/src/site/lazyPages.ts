import { lazy } from 'react'

// Loaded only when visited, so the home page does not carry the Markdown renderer.
export const DocsPage = lazy(() => import('../pages/DocsPage').then((module) => ({ default: module.DocsPage })))
export const PrivacyPage = lazy(() => import('../pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })))
