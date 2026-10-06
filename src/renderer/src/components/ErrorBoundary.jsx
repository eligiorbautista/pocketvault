import { Component } from 'react'

// Catches render/lifecycle errors anywhere below and shows a recovery screen
// instead of unmounting the whole app to a blank window (React has no built-in
// boundary). Used at the app root and around the lazily-loaded Reports route.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface for debugging; there is no remote telemetry in this offline app.
    console.error('Render error', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-dark-bg">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-[#333333]">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
              {this.props.message ??
                'An unexpected error occurred while displaying this screen.'}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-[#3d3d3d]"
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
