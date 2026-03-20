import type { HTMLAttributes, PropsWithChildren } from 'react'

type ChipVariant = 'filled' | 'outline'

type ChipProps = PropsWithChildren<
  HTMLAttributes<HTMLSpanElement> & {
    variant?: ChipVariant
  }
>

export function Chip({
  children,
  className,
  variant = 'filled',
  ...props
}: ChipProps) {
  const variantClass =
    variant === 'filled'
      ? 'bg-secondary/15 text-secondary'
      : 'border border-secondary/40 bg-transparent text-secondary'

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${variantClass} ${className ?? ''}`}
      {...props}
    >
      {children}
    </span>
  )
}
