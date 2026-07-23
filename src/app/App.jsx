import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthProvider.jsx'
import { Center, Spinner } from '@chakra-ui/react'
import AppShell from './AppShell.jsx'
import Landing from '../features/auth/Landing.jsx'
import Login from '../features/auth/Login.jsx'
import VerifyEmail from '../features/auth/VerifyEmail.jsx'
import Dashboard from '../features/dashboard/Dashboard.jsx'
import Expenses from '../features/transactions/Expenses.jsx'
import ImportExpenses from '../features/import/ImportExpenses.jsx'
import Budgets from '../features/budgets/Budgets.jsx'
import Income from '../features/transactions/Income.jsx'
import SearchTransactions from '../features/transactions/SearchTransactions.jsx'
import Recurring from '../features/recurring/Recurring.jsx'
import Insights from '../features/insights/Insights.jsx'
import More from './More.jsx'
import Groups from '../features/groups/Groups.jsx'
import GroupDetail from '../features/groups/GroupDetail.jsx'
import JoinGroup from '../features/groups/JoinGroup.jsx'
import GroupPreview from '../features/groups/GroupPreview.jsx'
import Profile from '../features/profile/Profile.jsx'
import PasskeyPrompt from '../features/profile/PasskeyPrompt.jsx'
import NotificationPrompt from '../features/notifications/NotificationPrompt.jsx'
import OnboardingWizard from '../features/onboarding/OnboardingWizard.jsx'
import { useProfile } from '../shared/lib/useProfile.js'
import { STORAGE_KEYS } from '../shared/lib/keys.js'

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
  const { profile, loading: profileLoading } = useProfile()
  // A brand-new account (no onboarded_at) gets the setup wizard, which also
  // folds in the passkey + notification asks — so the standalone prompts wait
  // until onboarding is done to avoid stacking.
  const needsOnboarding = !profileLoading && profile && !profile.onboarded_at

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
          <Route path="search" element={<SearchTransactions />} />
          <Route path="recurring" element={<Recurring />} />
          <Route path="insights" element={<Insights />} />
          <Route path="more" element={<More />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="import" element={<ImportExpenses />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="income" element={<Income />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:id" element={<GroupDetail />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {needsOnboarding ? (
        <OnboardingWizard profile={profile} />
      ) : (
        <>
          <PasskeyPrompt />
          <NotificationPrompt />
        </>
      )}
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
