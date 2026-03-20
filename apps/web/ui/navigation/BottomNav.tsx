type BottomNavItem = {
  key: string
  label: string
  active?: boolean
}

type BottomNavProps = {
  items: BottomNavItem[]
  onSelect?: (key: string) => void
}

export function BottomNav({ items, onSelect }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-[720px] gap-2 border-t border-black/10 bg-surface p-3">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect?.(item.key)}
          className={`flex-1 rounded-sm px-2 py-2 text-sm ${item.active ? 'bg-primary/10 text-primary' : 'text-onsurface/70'}`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
