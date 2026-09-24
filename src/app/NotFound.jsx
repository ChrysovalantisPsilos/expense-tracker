import { useEffect } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Button } from '@chakra-ui/react'
import { useAuth } from '../shared/auth/AuthProvider.jsx'
import ErrorScreen from '../shared/ui/ErrorScreen.jsx'
import PublicHeader from '../shared/ui/PublicHeader.jsx'
import useGoBack from '../shared/ui/useGoBack.js'

// The 404 page. Signed in it renders inside the app shell (a child route), so
// the navigation stays: Back to Home, or Go back. Signed out it's a public
// page: Go to Home (the landing page), or Help & FAQ.
// Every unknown address is served index.html with a 200, so while the 404 is
// on screen a robots meta tag keeps search engines from indexing it.
export default function NotFound() {
  const { user } = useAuth()
  const goBack = useGoBack('/')

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  if (user) {
    return <ErrorScreen variant="notFound" signedIn handlers={{ home: { to: '/' }, back: { onClick: goBack } }} />
  }
  return (
    <ErrorScreen variant="notFound" fullPage
      handlers={{ home: { to: '/' }, help: { to: '/help' } }}
      header={(
        <PublicHeader>
          <Button as={RouterLink} to="/login" size="sm" variant="ghost" px={{ base: 2, sm: 3 }}>Log in</Button>
        </PublicHeader>
      )} />
  )
}
