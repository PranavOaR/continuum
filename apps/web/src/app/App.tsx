import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { forgetRetiredData } from '../services/storage'
import { DataModeProvider } from '../state/DataModeProvider'
import { PreferencesProvider } from '../state/PreferencesProvider'
import { ToastProvider } from '../state/ToastProvider'
import { UIProvider } from '../state/UIProvider'
import { router } from './router'

export function App() {
  useEffect(() => forgetRetiredData(), [])
  return (
    <DataModeProvider>
      <PreferencesProvider>
        <ToastProvider>
          <UIProvider>
            <RouterProvider router={router} />
          </UIProvider>
        </ToastProvider>
      </PreferencesProvider>
    </DataModeProvider>
  )
}
