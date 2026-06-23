import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  message?: string
  showReload?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Wisp encountered an unexpected error:', error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const message = this.props.message ?? 'Something went wrong. Please restart Wisp.'
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4 text-center text-text-primary">
          <p className="text-sm text-text-secondary">{message}</p>
          {this.props.showReload !== false && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Reload
            </button>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
