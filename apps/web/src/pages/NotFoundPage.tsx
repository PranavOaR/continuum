import { ButtonLink } from '../components/shared/Button'
import { EmptyState } from '../components/shared/States'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage({ inApp = false }: { inApp?: boolean }) {
  useDocumentTitle('Page not found')
  const content = (
    <EmptyState
      title="Page not found"
      description="There's nothing at this address."
      action={
        <ButtonLink to={inApp ? '/app' : '/'} variant="primary" size="sm">
          {inApp ? 'Go to Overview' : 'Go home'}
        </ButtonLink>
      }
    />
  )
  if (inApp) return content
  return <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">{content}</div>
}
