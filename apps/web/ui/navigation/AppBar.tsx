import type { PropsWithChildren } from 'react'

type AppBarProps = PropsWithChildren<{
  title: string
}>

export function AppBar({ children, title }: AppBarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between rounded-md border border-black/10 bg-surface px-4 py-3 shadow-1">
      <h1 className="m-0 text-lg font-semibold">{title}</h1>
      <div>{children}</div>
    </header>
  )
}
