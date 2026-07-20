import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider.jsx'
import { Center, Spinner } from '@chakra-ui/react'
import AppShell from './components/AppShell.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import VerifyEmail from './pages/VerifyEmail.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Expenses from './pages/Expenses.jsx'
import ImportExpenses from './pages/ImportExpenses.jsx'
import Budgets from './pages/Budgets.jsx'
import Income from './pages/Income.jsx'
import Reports from './pages/Reports.jsx'
import Groups from './pages/Groups.jsx'
import GroupDetail from './pages/GroupDetail.jsx'
import JoinGroup from './pages/JoinGroup.jsx'
import GroupPreview from './pages/GroupPreview.jsx'
import Profile from './pages/Profile.jsx'
import PasskeyPrompt from './components/PasskeyPrompt.jsx'
import { STORAGE_KEYS } from './lib/keys.js'

const PENDING_INVITE = STORAGE_KEYS.pendingInvite

// Logged-out invite link -> read-only group preview. Its CTAs stash the token
// (localStorage survives the email-confirmation round-trip in the same browser)
// and send the visitor to sign up; AuthedRoutes then redeems it.
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/join/:token" element={<GroupPreview />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  )
}

function AuthedRoutes() {
  const navigate = useNavigate()
  useEffect(() => {
    const token = localStorage.getItem(PENDING_INVITE)
    if (token) {
      localStorage.removeItem(PENDING_INVITE)
      navigate(`/join/${token}`, { replace: true })
    }
  }, [navigate])

  return (
    <>
      <Routes>
        <Route path="/join/:token" element={<JoinGroup />} />
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="import" element={<ImportExpenses />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="income" element={<Income />} />
          <Route path="reports" element={<Reports />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:id" element={<GroupDetail />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PasskeyPrompt />
    </>
  )
}

export default function App() {
  const { session, loading } = useAuth()
  if (loading) {
    return <Center h="100dvh"><Spinner size="lg" color="brand.500" /></Center>
  }
  return session ? <AuthedRoutes /> : <PublicRoutes />
}
