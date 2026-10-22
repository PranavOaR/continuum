import { RouterProvider } from 'react-router-dom'
import { DataModeProvider } from '../state/DataModeProvider'
import { HandoffsProvider } from '../state/HandoffsProvider'
import { PreferencesProvider } from '../state/PreferencesProvider'
import { ToastProvider } from '../state/ToastProvider'
import { UIProvider } from '../state/UIProvider'
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
