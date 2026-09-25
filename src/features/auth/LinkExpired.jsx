import { useNavigate } from 'react-router-dom'
import { Button, Stack } from '@chakra-ui/react'
import { AlertTriangle } from 'lucide-react'
import AuthLayout from './AuthLayout.jsx'
import { expiredLinkHelp } from './confirmLink.js'

// An email link that can't be used (expired, used already, or mangled by the
// mail app): what happened in plain words, and the way to a fresh one.
// `type` is the link's type (confirmLink.js).
export default function LinkExpired({ type }) {
  const navigate = useNavigate()
  const { text, actions } = expiredLinkHelp(type)
  return (
    <AuthLayout icon={<AlertTriangle size={28} />} iconColor="status.warning"
      title="Link expired or invalid" subtitle={text}>
      <Stack spacing={3}>
        {actions.map((a, i) => (
          <Button key={a.to} variant={i === 0 ? 'solid' : 'ghost'} onClick={() => navigate(a.to)}>
            {a.label}
          </Button>
        ))}
      </Stack>
    </AuthLayout>
  )
}
