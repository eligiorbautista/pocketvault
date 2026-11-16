import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import { cn } from '@renderer/lib/cn.js'

// Ellipsis "row actions" menu for desktop tables. Items are text-only. Rendered
// in a portal so the dropdown is never clipped by the table's overflow container.
// `actions`: [{ key, label, tone?: 'danger', onSelect }]
export function RowActionsMenu({ actions, label = 'Row actions', triggerClassName }) {
  const items = (actions ?? []).filter(Boolean)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const openMenu = () => {
    const rect = buttonRef.current.getBoundingClientRect()
    // Flip above the trigger when the menu would fall off the bottom of a phone/tablet.
    const menuHeight = items.length * 44 + 8
    const top =
      window.innerHeight - rect.bottom < menuHeight + 8
        ? Math.max(8, rect.top - menuHeight - 6)
        : rect.bottom + 6
    setPosition({ top, left: Math.min(rect.right, window.innerWidth - 8) })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      const panel = menuRef.current
      if (!panel) return
      const options = Array.from(panel.querySelectorAll('[role="menuitem"]'))
      if (options.length === 0) return
      event.preventDefault()
      const current = options.indexOf(document.activeElement)
      let next
      if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = options.length - 1
      else if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % options.length
      else next = current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length
      options[next].focus()
    }
    const close = () => setOpen(false)
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    // Move focus into the menu so keyboard users land on the first item.
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:focus-visible:outline-accent-400',
          open
            ? 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-100'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-dark-faint dark:hover:bg-dark-surface-2 dark:hover:text-gray-100',
          triggerClassName
        )}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              style={{ position: 'fixed', top: position.top, left: position.left, transform: 'translateX(-100%)' }}
              className="z-[60] min-w-[10rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-dark-border dark:bg-dark-surface"
            >
              {items.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    action.onSelect?.()
                  }}
                  className={cn(
                    'block min-h-11 w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors',
                    action.tone === 'danger'
                      ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-dark-surface-2'
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
