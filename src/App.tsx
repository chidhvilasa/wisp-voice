import Router from './router'
import { ErrorBoundary } from './components/ErrorBoundary'

function App() {
  return (
    <div className="min-h-screen bg-background">
      <ErrorBoundary>
        <Router />
      </ErrorBoundary>
    </div>
  )
}

export default App
