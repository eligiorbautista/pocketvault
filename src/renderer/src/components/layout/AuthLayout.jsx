import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark size={52} className="mb-3 rounded-xl" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>
        {footer ? <div className="mt-4 text-center text-sm text-slate-500">{footer}</div> : null}
        <p className="mt-6 text-center text-xs text-slate-400">
          All data is stored locally on this device.
        </p>
      </div>
    </div>
  )
}
