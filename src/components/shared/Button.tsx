import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'group/button inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono font-medium uppercase tracking-[0.06em] transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5 [&_svg]:shrink-0'

const VARIANTS: Record<Variant, string> = {
  primary: 'border border-accent-strong bg-accent-strong text-accent-fg hover:border-accent-hover hover:bg-accent-hover',
  secondary: 'border border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3',
  ghost: 'border border-transparent text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/40 bg-danger/5 text-danger hover:bg-danger/10',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[11px]',
  md: 'h-10 px-4 text-[12px]',
}

/** Primary buttons place their icon in a white square, flush to the left edge. */
const ICON_BOX: Record<Size, string> = {
  sm: '-ml-[11px] mr-0.5 size-[30px]',
  md: '-ml-[15px] mr-1 size-[38px]',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra)
}

function ButtonIcon({ icon, variant, size }: { icon?: ReactNode; variant: Variant; size: Size }) {
  if (!icon) return null
  if (variant !== 'primary') return <>{icon}</>
  return <span className={cn('flex shrink-0 items-center justify-center bg-accent-fg text-accent-strong', ICON_BOX[size])}>{icon}</span>
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      <ButtonIcon icon={icon} variant={variant} size={size} />
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
      <ButtonIcon icon={icon} variant={variant} size={size} />
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
        'inline-flex size-8 items-center justify-center text-muted transition-colors hover:bg-surface-2 hover:text-fg [&_svg]:size-4',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
