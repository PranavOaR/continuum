import { RouterProvider } from 'react-router-dom'
import { DataModeProvider } from '../state/dataMode'
import { HandoffsProvider } from '../state/handoffs'
import { PreferencesProvider } from '../state/preferences'
import { ToastProvider } from '../state/toasts'
import { UIProvider } from '../state/ui'
import { router } from './router'

export function App() {
  return (
    <DataModeProvider>
      <PreferencesProvider>
        <HandoffsProvider>
          <ToastProvider>
            <UIProvider>
              <RouterProvider router={router} />
            </UIProvider>
          </ToastProvider>
        </HandoffsProvider>
      </PreferencesProvider>
    </DataModeProvider>
  )
}
