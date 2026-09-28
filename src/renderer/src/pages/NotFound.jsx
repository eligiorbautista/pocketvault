import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent-600">404</p>
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="max-w-sm text-sm text-slate-500">
        The page you are looking for doesn&apos;t exist.
      </p>
      <Link
        to="/"
        className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
      >
        Back to dashboard
      </Link>
    </div>
  )
}
