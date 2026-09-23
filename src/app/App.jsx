import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthProvider.jsx'
import { Center, Spinner } from '@chakra-ui/react'
import AppShell from './AppShell.jsx'
import Landing from '../features/landing/Landing.jsx'
import Login from '../features/auth/Login.jsx'
import VerifyEmail from '../features/auth/VerifyEmail.jsx'
import ForgotPassword from '../features/auth/ForgotPassword.jsx'
import ResetPassword from '../features/auth/ResetPassword.jsx'
import Dashboard from '../features/dashboard/Dashboard.jsx'
import ImportExpenses from '../features/import/ImportExpenses.jsx'
import Budgets from '../features/budgets/Budgets.jsx'
import LedgerPage from '../features/transactions/LedgerPage.jsx'
import Recurring from '../features/recurring/Recurring.jsx'
import Insights from '../features/insights/Insights.jsx'
import More from './More.jsx'
import Groups from '../features/groups/Groups.jsx'
import GroupDetail from '../features/groups/GroupDetail.jsx'
import JoinGroup from '../features/groups/JoinGroup.jsx'
import GroupPreview from '../features/groups/GroupPreview.jsx'
import Settings from '../features/settings/Settings.jsx'
import AccountSettings from '../features/settings/AccountSettings.jsx'
import NotificationSettings from '../features/settings/NotificationSettings.jsx'
import AppearanceSettings from '../features/settings/AppearanceSettings.jsx'
import Categories from '../features/categories/Categories.jsx'
import SecuritySettings from '../features/settings/SecuritySettings.jsx'
import PasskeyPrompt from '../features/settings/PasskeyPrompt.jsx'
import YourData from '../features/backup/YourData.jsx'
import Privacy from '../features/privacy/Privacy.jsx'
import NotificationPrompt from '../features/notifications/NotificationPrompt.jsx'
import OnboardingWizard from '../features/onboarding/OnboardingWizard.jsx'
import { useProfile } from '../shared/lib/ProfileProvider.jsx'
import { useEnsureDefaultCategories } from '../features/transactions/useData.js'
import { STORAGE_KEYS } from '../shared/lib/keys.js'

const PENDING_INVITE = STORAGE_KEYS.pendingInvite

// Dev-only UI kit gallery at /kit. import.meta.env.DEV is false in production
// builds, so the route and the gallery chunk are dropped from them entirely.
const KitGallery = import.meta.env.DEV ? lazy(() => import('../shared/ui/kit/KitGallery.jsx')) : null
const kitRoute = KitGallery && (
  <Route path="/kit" element={<Suspense fallback={null}><KitGallery /></Suspense>} />
)

// Logged-out invite link -> read-only group preview. Its CTAs stash the token
// (localStorage survives the email-confirmation round-trip in the same browser)
// and send the visitor to sign up; AuthedRoutes then redeems it.
function PublicRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join/:token" element={<GroupPreview />} />
      <Route path="/privacy" element={<Privacy />} />
      {kitRoute}
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

  // First-login default-category seed (a data hook owned by transactions, so
  // the shared profile code never reaches into a feature).
  useEnsureDefaultCategories()

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
        <Route path="/privacy" element={<Privacy />} />
        {kitRoute}
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="recurring" element={<Recurring />} />
          <Route path="insights" element={<Insights />} />
          <Route path="more" element={<More />} />
          <Route path="transactions" element={<LedgerPage />} />
          <Route path="import" element={<ImportExpenses />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:id" element={<GroupDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/account" element={<AccountSettings />} />
          <Route path="settings/notifications" element={<NotificationSettings />} />
          <Route path="settings/appearance" element={<AppearanceSettings />} />
          <Route path="settings/categories" element={<Categories />} />
          <Route path="settings/security" element={<SecuritySettings />} />
          <Route path="settings/data" element={<YourData />} />
          {/* Old name for Settings — keeps bookmarks and old links working. */}
          <Route path="profile" element={<Navigate to="/settings" replace />} />
          {/* Expenses, Income and Search became one Transactions page. */}
          <Route path="expenses" element={<Navigate to="/transactions?type=expense" replace />} />
          <Route path="income" element={<Navigate to="/transactions?type=income" replace />} />
          <Route path="search" element={
            <Navigate to="/transactions?type=all" replace state={{ focusSearch: true }} />
          } />
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
  const { session, loading, recovering } = useAuth()
  if (loading) {
    return <Center h="100dvh"><Spinner size="lg" color="brand.500" /></Center>
  }
  // A password-recovery link signs the user in, but they must set a new password
  // before doing anything else — so this screen preempts the normal routing.
  if (recovering) return <ResetPassword />
  return session ? <AuthedRoutes /> : <PublicRoutes />
}
