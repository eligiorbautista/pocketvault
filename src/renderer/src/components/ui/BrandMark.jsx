import { cn } from '@renderer/lib/cn.js'

export function BrandMark({ size = 36, className }) {
  return (
    <img
      src="./icon.png"
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-lg', className)}
      aria-hidden="true"
      draggable="false"
    />
  )
}
