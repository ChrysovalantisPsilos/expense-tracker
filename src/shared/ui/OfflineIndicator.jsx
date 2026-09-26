import { useEffect, useState } from 'react'
import { Badge } from '@chakra-ui/react'
import { WifiOff } from 'lucide-react'
import { useT } from '../lib/i18n/I18nProvider.jsx'

// Persistent offline indicator: renders nothing while online, and a standing
// "Offline" pill whenever the browser loses its connection. Since writes need
// a connection (there's no offline queue), this is the always-on cue that
// saves won't go through until it clears — the failed-write toast is the
// moment-of-action reminder, this is the ambient state.
export default function OfflineIndicator() {
  const t = useT()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online) return null
  return (
    <Badge bg="bg.subtle" color="status.warning" display="flex" alignItems="center" gap={1}>
      <WifiOff size={12} /> {t('offline')}
    </Badge>
  )
}
