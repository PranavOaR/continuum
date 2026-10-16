import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium tracking-[-0.005em] transition-[background-color,border-color,color,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0'

const VARIANTS: Record<Variant, string> = {
  primary: 'border border-accent-strong bg-accent-strong text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.2)] hover:border-accent-hover hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-fg hover:border-line-strong hover:bg-surface-2',
  ghost: 'border border-transparent text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/40 bg-danger/5 text-danger hover:bg-danger/10',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, typeof className === 'string' ? className : undefined)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

export function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
