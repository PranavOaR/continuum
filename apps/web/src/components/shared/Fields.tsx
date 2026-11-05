import { ChevronDown, Search, X } from 'lucide-react'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  label: string
}

export function SearchInput({ value, onChange, label, className, ...rest }: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-line bg-surface pr-8 pl-8 text-[13px] text-fg placeholder:text-subtle focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        {...rest}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-fg"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hideLabel?: boolean
  children: ReactNode
}

export function SelectField({ label, hideLabel, className, children, id, ...rest }: SelectFieldProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={selectId} className={cn('label-mono text-subtle', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          className="h-9 w-full appearance-none rounded-md border border-line bg-surface pr-8 pl-3 text-[13px] text-fg focus:border-accent focus:outline-none"
          {...rest}
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-subtle" />
      </div>
    </div>
  )
}


interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  'data-autofocus'?: boolean
}

const TEXT_FIELD = 'w-full rounded-md border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-subtle focus:border-accent focus:outline-none'

export function TextField({ label, hint, value, onChange, multiline, maxLength, required, autoFocus, ...rest }: TextFieldProps) {
  const id = useId()
  const hintId = useId()
  const shared = { id, value, maxLength, required, autoFocus, 'aria-describedby': hint ? hintId : undefined, 'data-autofocus': rest['data-autofocus'] }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="label-mono text-subtle">
        {label}
      </label>
      {multiline ? (
        <textarea rows={3} className={cn(TEXT_FIELD, 'py-2')} onChange={(event) => onChange(event.target.value)} {...shared} />
      ) : (
        <input type="text" className={cn(TEXT_FIELD, 'h-9')} onChange={(event) => onChange(event.target.value)} {...shared} />
      )}
      {hint && (
        <p id={hintId} className="text-[12px] text-subtle">
          {hint}
        </p>
      )}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {description && <p className="text-[12px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
          checked ? 'border-accent-strong bg-accent-strong' : 'border-line-strong bg-surface-3 [&>span]:bg-subtle',
        )}
      >
        <span
          aria-hidden
          className={cn('inline-block size-3.5 rounded-full bg-white transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')}
        />
      </button>
    </div>
  )
}
