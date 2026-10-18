// `@entry` is the dashboard (src/app/mountApp.tsx), or the public website when
// built with VITE_CONTINUUM_SITE=website (src/site/mountSite.tsx); see vite.config.ts.
import { mount } from '@entry'
import './styles/globals.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')
mount(rootElement)
