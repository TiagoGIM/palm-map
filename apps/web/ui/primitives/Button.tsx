import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type ButtonVariant = 'filled' | 'tonal' | 'text'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
  }
>

export function Button({
  children,
  className,
  type = 'button',
  variant = 'filled',
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'filled'
      ? 'bg-primary text-white'
      : variant === 'tonal'
        ? 'bg-primary/10 text-primary'
        : 'bg-transparent text-primary'

  return (
    <button
      type={type}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-opacity duration-fast disabled:opacity-70 ${variantClass} ${className ?? ''}`}
      {...props}
    >
      {children}
    </button>
  )
}
