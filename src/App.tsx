import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import Router from './router'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Wisp encountered an unexpected error:', error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-text-primary">
          <p className="text-sm text-text-secondary">Something went wrong. Please restart Wisp.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

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
