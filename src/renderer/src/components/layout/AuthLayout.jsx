import { BrandMark } from '@renderer/components/ui/BrandMark.jsx'

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-dark-bg">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark size={52} className="mb-3 rounded-xl" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-gray-100">
            {title}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-[#333333] sm:p-8">
          {children}
        </div>
        {footer ? (
          <div className="mt-4 text-center text-sm text-slate-500 dark:text-gray-400">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
