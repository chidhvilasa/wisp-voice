import { useEffect, useState } from 'react'

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
    return <div>Wisp Overlay</div>
  }

  return <div>Wisp App</div>
}
