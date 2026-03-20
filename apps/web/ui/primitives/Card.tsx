import type { HTMLAttributes, PropsWithChildren } from 'react'

type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export function Card({ children, className, ...props }: CardProps) {
  return (
    <div
      className={`rounded-md border border-black/10 bg-surface p-3 shadow-1 ${className ?? ''}`}
      {...props}
    >
      {children}
    </div>
  )
}
