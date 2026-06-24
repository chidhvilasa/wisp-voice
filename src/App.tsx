import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Router from './router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useSettingsStore } from './store/settingsStore'

function App() {
  useEffect(() => {
    // The Rust backend only knows the hardcoded default key combos until
    // told otherwise, so a user's customized, persisted hotkeys must be
    // re-pushed once here on every launch — otherwise they silently revert
    // to defaults after a restart even though the Settings UI still shows
    // the customized binding.
    void invoke('update_hotkeys', { hotkeys: useSettingsStore.getState().hotkeys }).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <ErrorBoundary>
        <Router />
      </ErrorBoundary>
    </div>
  )
}

export default App
