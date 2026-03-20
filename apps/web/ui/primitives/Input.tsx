import type { InputHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

export function Input({ className, error, id, label, ...props }: InputProps) {
  const fieldId = id ?? props.name

  return (
    <label className="grid gap-2 text-sm">
      <span>{label}</span>
      <input
        id={fieldId}
        className={`w-full rounded-sm border border-black/20 bg-surface px-3 py-2 text-sm text-onsurface ${className ?? ''}`}
        {...props}
      />
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  )
}
