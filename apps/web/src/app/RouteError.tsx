import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { ButtonLink } from '../components/shared/Button'
import { ErrorState } from '../components/shared/States'

/** On the website (`isSite`) there is no dashboard to go back to, so it links home. */
export function RouteError({ isSite = false }: { isSite?: boolean }) {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : 'Unknown error'
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <ErrorState title="Something went wrong" description={message} action={<ButtonLink to={isSite ? '/' : '/app'}>{isSite ? 'Back to the home page' : 'Back to Overview'}</ButtonLink>} />
    </div>
  )
}
