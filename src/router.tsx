import { useEffect, useState } from 'react'
import Overlay from './overlay/Overlay'
import Home from './pages/Home'
import Room from './pages/Room'
import { ErrorBoundary } from './components/ErrorBoundary'

function getRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

export default function Router() {
  const [route, setRoute] = useState(getRoute())

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (route.startsWith('/overlay')) {
    return (
      <ErrorBoundary message="Overlay error" showReload={false}>
        <Overlay />
      </ErrorBoundary>
    )
  }

  if (route.startsWith('/room')) {
    return <Room />
  }

  return <Home />
}
