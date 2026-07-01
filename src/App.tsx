import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Router from './router'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateBanner } from './components/UpdateBanner'
import { InvitePopup } from './components/InvitePopup'
import { FriendRequestPopup } from './components/FriendRequestPopup'
import { usePresence } from './hooks/usePresence'
import { useSettingsStore } from './store/settingsStore'
import { useVoiceStore } from './store/voiceStore'
import { joinRoom, saveRecentRoom, checkMinimumVersion } from './lib/rooms'
import { acceptRequest, declineRequest } from './lib/friends'

function UnsupportedVersionBanner() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        background: '#DC2626',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      <span style={{ color: 'white', fontSize: '13px', fontWeight: 600 }}>
        This version of Wisp is no longer supported. Please update to continue.
      </span>
    </div>
  )
}

function isOverlayRoute(): boolean {
  return window.location.hash.replace(/^#/, '').startsWith('/overlay')
}

function navigate(path: string): void {
  window.location.hash = path
}

// usePresence() opens a real WebSocket to the presence server, and each Wisp
// ID can only have one live connection - if both the main window and the
// overlay window connected, whichever connected last would silently steal
// the slot from the other. Scoping the hook to a component that's only
// rendered for the main window's route keeps the overlay window from ever
// calling it.
function MainAppShell() {
  const { activeInvite, clearInvite, markInviteUsed, activeFriendRequest, clearFriendRequest } = usePresence()

  const handleAcceptInvite = () => {
    if (!activeInvite) return
    const { roomCode } = activeInvite
    const displayName = useSettingsStore.getState().displayName
    markInviteUsed(roomCode)
    clearInvite()
    useVoiceStore.getState().setIsHost(false)
    useVoiceStore.getState().setRoomCode(roomCode)
    useVoiceStore.getState().setDisplayName(displayName)
    void joinRoom(roomCode)
      .then(() => saveRecentRoom({ code: roomCode, name: roomCode, lastUsed: Date.now(), memberCount: 1 }))
      .catch(() => {})
    navigate('/room')
  }

  const handleAcceptFriendRequest = () => {
    if (!activeFriendRequest) return
    acceptRequest(activeFriendRequest.from)
    clearFriendRequest()
  }

  const handleDeclineFriendRequest = () => {
    if (!activeFriendRequest) return
    declineRequest(activeFriendRequest.from)
    clearFriendRequest()
  }

  return (
    <div className="min-h-screen bg-background">
      <UpdateBanner />
      <ErrorBoundary>
        <Router />
      </ErrorBoundary>
      {activeInvite && (
        <InvitePopup invite={activeInvite} onAccept={handleAcceptInvite} onDecline={clearInvite} />
      )}
      {!activeInvite && activeFriendRequest && (
        <FriendRequestPopup
          request={activeFriendRequest}
          onAccept={handleAcceptFriendRequest}
          onDecline={handleDeclineFriendRequest}
        />
      )}
    </div>
  )
}

function App() {
  const [overlay, setOverlay] = useState(isOverlayRoute())
  const [needsUpdate, setNeedsUpdate] = useState(false)

  useEffect(() => {
    // The Rust backend only knows the hardcoded default key combos until
    // told otherwise, so a user's customized, persisted hotkeys must be
    // re-pushed once here on every launch — otherwise they silently revert
    // to defaults after a restart even though the Settings UI still shows
    // the customized binding.
    void invoke('update_hotkeys', { hotkeys: useSettingsStore.getState().hotkeys }).catch(() => {})
  }, [])

  useEffect(() => {
    const onHashChange = () => setOverlay(isOverlayRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    // Gates joinRoom()/createRoom() at the network layer (see lib/rooms.ts);
    // this just surfaces the same decision to the UI so old installs know why.
    void checkMinimumVersion().then(setNeedsUpdate)
  }, [])

  // The overlay window needs a fully transparent background (no wrapping
  // div, no UpdateBanner, no invite popup) - Router already renders its own
  // ErrorBoundary for that route, so just defer to it directly here.
  if (overlay) return <Router />

  return (
    <>
      {needsUpdate && <UnsupportedVersionBanner />}
      <MainAppShell />
    </>
  )
}

export default App
