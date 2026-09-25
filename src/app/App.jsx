import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../shared/auth/AuthProvider.jsx'
import AppShell from './AppShell.jsx'
import PasskeyPrompt from '../features/settings/PasskeyPrompt.jsx'
import NotificationPrompt from '../features/notifications/NotificationPrompt.jsx'
import WhatsNewPrompt from '../features/whatsnew/WhatsNewPrompt.jsx'
import { useProfile } from '../shared/lib/ProfileProvider.jsx'
import { useEnsureDefaultCategories } from '../features/transactions/useData.js'
import { useTour } from '../features/onboarding/tour.js'
import { useLegalGate } from '../features/privacy/useLegalGate.js'
import { GATE_VIEW } from '../features/privacy/legalGateMath.js'
// Not lazy: it's the screen shown when the network is down.
import LegalCheckError from '../features/privacy/LegalCheckError.jsx'
import { STORAGE_KEYS } from '../shared/lib/keys.js'
import RingLoader from '../shared/ui/RingLoader.jsx'
import SkipLink from '../shared/ui/SkipLink.jsx'
import { loginPathFor, NEXT_PARAM, safeReturnPath, takeReturnPath } from '../shared/lib/returnPath.js'
import NotFound from './NotFound.jsx'
import { isSignedInRoute } from './routes.js'

// Every page is its own chunk, fetched on first visit (the service worker
// precaches them all, so this costs nothing offline). The shell and the
// always-on prompts stay in the entry chunk.
const Landing = lazy(() => import('../features/landing/Landing.jsx'))
const Login = lazy(() => import('../features/auth/Login.jsx'))
const VerifyEmail = lazy(() => import('../features/auth/VerifyEmail.jsx'))
const ConfirmLink = lazy(() => import('../features/auth/ConfirmLink.jsx'))
const ForgotPassword = lazy(() => import('../features/auth/ForgotPassword.jsx'))
const ResetPassword = lazy(() => import('../features/auth/ResetPassword.jsx'))
const Dashboard = lazy(() => import('../features/dashboard/Dashboard.jsx'))
const ImportExpenses = lazy(() => import('../features/import/ImportExpenses.jsx'))
const Budgets = lazy(() => import('../features/budgets/Budgets.jsx'))
const LedgerPage = lazy(() => import('../features/transactions/LedgerPage.jsx'))
const TransactionPage = lazy(() => import('../features/transactions/TransactionPage.jsx'))
const Recurring = lazy(() => import('../features/recurring/Recurring.jsx'))
const RecurringPage = lazy(() => import('../features/recurring/RecurringPage.jsx'))
const Insights = lazy(() => import('../features/insights/Insights.jsx'))
const GoalPage = lazy(() => import('../features/insights/GoalPage.jsx'))
const AccountPage = lazy(() => import('../features/insights/AccountPage.jsx'))
const More = lazy(() => import('./More.jsx'))
const Groups = lazy(() => import('../features/groups/Groups.jsx'))
const GroupDetail = lazy(() => import('../features/groups/GroupDetail.jsx'))
const NewGroupPage = lazy(() => import('../features/groups/NewGroupPage.jsx'))
const EditGroupPage = lazy(() => import('../features/groups/EditGroupPage.jsx'))
const MembersPage = lazy(() => import('../features/groups/MembersPage.jsx'))
const SettleUpPage = lazy(() => import('../features/groups/SettleUpPage.jsx'))
const GroupExpensePage = lazy(() => import('../features/groups/GroupExpensePage.jsx'))
const CommentsPage = lazy(() => import('../features/groups/CommentsPage.jsx'))
const JoinGroup = lazy(() => import('../features/groups/JoinGroup.jsx'))
const GroupPreview = lazy(() => import('../features/groups/GroupPreview.jsx'))
const Settings = lazy(() => import('../features/settings/Settings.jsx'))
const AccountSettings = lazy(() => import('../features/settings/AccountSettings.jsx'))
const NotificationSettings = lazy(() => import('../features/settings/NotificationSettings.jsx'))
const AppearanceSettings = lazy(() => import('../features/settings/AppearanceSettings.jsx'))
const SpendingSettings = lazy(() => import('../features/settings/SpendingSettings.jsx'))
const Categories = lazy(() => import('../features/categories/Categories.jsx'))
const CategoryPage = lazy(() => import('../features/categories/CategoryPage.jsx'))
const NewCategoryPage = lazy(() => import('../features/categories/NewCategoryPage.jsx'))
const SecuritySettings = lazy(() => import('../features/settings/SecuritySettings.jsx'))
const YourData = lazy(() => import('../features/backup/YourData.jsx'))
const ExportBackupPage = lazy(() => import('../features/backup/ExportBackupPage.jsx'))
const RestoreBackupPage = lazy(() => import('../features/backup/RestoreBackupPage.jsx'))
const Privacy = lazy(() => import('../features/privacy/Privacy.jsx'))
const Terms = lazy(() => import('../features/privacy/Terms.jsx'))
const PrivacySettings = lazy(() => import('../features/privacy/PrivacySettings.jsx'))
const PrivacyRequestPage = lazy(() => import('../features/privacy/PrivacyRequestPage.jsx'))
const LegalGate = lazy(() => import('../features/privacy/LegalGate.jsx'))
const WhatsNewPage = lazy(() => import('../features/whatsnew/WhatsNewPage.jsx'))
const Help = lazy(() => import('../features/help/Help.jsx'))
const OnboardingWizard = lazy(() => import('../features/onboarding/OnboardingWizard.jsx'))
const ProductTour = lazy(() => import('../features/onboarding/ProductTour.jsx'))

const PENDING_INVITE = STORAGE_KEYS.pendingInvite

// Dev-only UI kit gallery at /kit. import.meta.env.DEV is false in production
// builds, so the route and the gallery chunk are dropped from them entirely.
const KitGallery = import.meta.env.DEV ? lazy(() => import('../shared/ui/kit/KitGallery.jsx')) : null
const kitRoute = KitGallery && (
  <Route path="/kit" element={<KitGallery />} />
)

// Signed out, an address no public page answers: an app page (routes.js)
// goes to sign-in and comes back afterwards; anything else is the 404.
function SignedOutFallback() {
  const location = useLocation()
  if (isSignedInRoute(location.pathname)) return <Navigate to={loginPathFor(location)} replace />
  return <NotFound />
}

// Signed in on /login (the moment a password or passkey sign-in lands, or an
// old bookmark): on to the page the visitor was headed for, else Home.
function SignedInLogin() {
  const [params] = useSearchParams()
  return <Navigate to={safeReturnPath(params.get(NEXT_PARAM)) ?? '/'} replace />
}

// Logged-out invite link -> read-only group preview. Its CTAs stash the token
// (localStorage survives the email-confirmation round-trip in the same browser)
// and send the visitor to sign up; AuthedRoutes then redeems it.
function PublicRoutes() {
  return (
    <Suspense fallback={<RingLoader fullScreen />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/confirm" element={<ConfirmLink />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/join/:token" element={<GroupPreview />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/help" element={<Help />} />
        {kitRoute}
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<SignedOutFallback />} />
      </Routes>
    </Suspense>
  )
}

function AuthedRoutes() {
  const navigate = useNavigate()
  const { profile, loading: profileLoading } = useProfile()
  // A brand-new account (no onboarded_at) gets the setup wizard, which also
  // folds in the passkey + notification asks — so the standalone prompts wait
  // until onboarding is done to avoid stacking.
  const needsOnboarding = !profileLoading && profile && !profile.onboarded_at
  // The app tour follows the wizard (its last step starts it) and can be
  // replayed from Settings. If it was never finished or skipped (the app
  // closed mid-tour), it picks up again once per session. (=== false: a
  // profile without the 0069 column never auto-starts it.)
  const { tour, endTour } = useTour(!profileLoading && !!profile?.onboarded_at && profile.tour_done === false)

  // First-login default-category seed (a data hook owned by transactions, so
  // the shared profile code never reaches into a feature).
  useEnsureDefaultCategories()

  // Arriving signed in from a sign-in that left the page (Google, the email
  // confirmation link, a password reset): a pending invite first, else the
  // page the visitor was headed for (Login stashed it; returnPath.js).
  useEffect(() => {
    const token = localStorage.getItem(PENDING_INVITE)
    const back = takeReturnPath()
    if (token) {
      localStorage.removeItem(PENDING_INVITE)
      navigate(`/join/${token}`, { replace: true })
    } else if (back) {
      navigate(back, { replace: true })
    }
  }, [navigate])

  return (
    <Suspense fallback={<RingLoader fullScreen />}>
      <Routes>
        <Route path="/join/:token" element={<JoinGroup />} />
        <Route path="/login" element={<SignedInLogin />} />
        {/* Signed-out pages. /auth/confirm lands here the moment its link
            signs in, and the effect above picks the page to go on to. */}
        {['/verify-email', '/auth/confirm', '/forgot-password', '/reset-password'].map((path) => (
          <Route key={path} path={path} element={<Navigate to="/" replace />} />
        ))}
        {kitRoute}
        <Route element={<AppShell hideAddExpense={!!tour} />}>
          <Route index element={<Dashboard />} />
          <Route path="recurring" element={<Recurring />} />
          <Route path="recurring/new" element={<RecurringPage />} />
          <Route path="recurring/:id" element={<RecurringPage />} />
          <Route path="insights" element={<Insights />} />
          <Route path="insights/goals/new" element={<GoalPage />} />
          <Route path="insights/goals/:id" element={<GoalPage />} />
          <Route path="insights/accounts/new" element={<AccountPage />} />
          <Route path="insights/accounts/:id" element={<AccountPage />} />
          <Route path="more" element={<More />} />
          <Route path="transactions" element={<LedgerPage />} />
          <Route path="transactions/new" element={<TransactionPage />} />
          <Route path="transactions/:id" element={<TransactionPage />} />
          <Route path="import" element={<ImportExpenses />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="categories/:id" element={<CategoryPage />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/new" element={<NewGroupPage />} />
          <Route path="groups/:id" element={<GroupDetail />} />
          <Route path="groups/:id/edit" element={<EditGroupPage />} />
          <Route path="groups/:id/members" element={<MembersPage />} />
          <Route path="groups/:id/settle" element={<SettleUpPage />} />
          <Route path="groups/:id/expenses/new" element={<GroupExpensePage />} />
          <Route path="groups/:id/expenses/:expenseId" element={<GroupExpensePage />} />
          <Route path="groups/:id/comments/:itemId" element={<CommentsPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/account" element={<AccountSettings />} />
          <Route path="settings/notifications" element={<NotificationSettings />} />
          <Route path="settings/appearance" element={<AppearanceSettings />} />
          <Route path="settings/spending" element={<SpendingSettings />} />
          <Route path="settings/categories" element={<Categories />} />
          <Route path="settings/categories/new" element={<NewCategoryPage />} />
          <Route path="settings/security" element={<SecuritySettings />} />
          <Route path="settings/data" element={<YourData />} />
          <Route path="settings/data/export" element={<ExportBackupPage />} />
          <Route path="settings/data/restore" element={<RestoreBackupPage />} />
          <Route path="settings/privacy" element={<PrivacySettings />} />
          <Route path="settings/privacy/request" element={<PrivacyRequestPage />} />
          <Route path="settings/whats-new" element={<WhatsNewPage />} />
          <Route path="help" element={<Help />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          {/* Old name for Settings — keeps bookmarks and old links working. */}
          <Route path="profile" element={<Navigate to="/settings" replace />} />
          {/* Expenses, Income and Search became one Transactions page. */}
          <Route path="expenses" element={<Navigate to="/transactions?type=expense" replace />} />
          <Route path="income" element={<Navigate to="/transactions?type=income" replace />} />
          <Route path="search" element={
            <Navigate to="/transactions?type=all" replace state={{ focusSearch: true }} />
          } />
          {/* Any other address: the 404, inside the shell. */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      {needsOnboarding ? (
        <Suspense fallback={null}><OnboardingWizard profile={profile} /></Suspense>
      ) : tour ? (
        <Suspense fallback={null}><ProductTour {...tour} onEnd={endTour} /></Suspense>
      ) : (
        <>
          <PasskeyPrompt />
          <NotificationPrompt />
          {/* After the profile loads: it needs onboarded_at to tell a new account apart. */}
          {!profileLoading && profile && <WhatsNewPrompt onboardedAt={profile.onboarded_at} />}
        </>
      )}
    </Suspense>
  )
}

// While the legal prompt or the check's error screen stands in for the app,
// only the public documents it links to are reachable (full page, with a Back
// button to it); every other address shows `screen`.
function LockedRoutes({ screen }) {
  return (
    <Suspense fallback={<RingLoader fullScreen />}>
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={screen} />
      </Routes>
    </Suspense>
  )
}

// Signed in: nothing of the app mounts (no pages, no data hooks, no prompts)
// until the server says the Privacy Notice and Terms in force are accepted.
// Consent fails closed: no answer yet → the loader; not accepted → only the
// prompt; can't reach the server → "Try again", unless this device already
// saw this account accept the current versions (useLegalGate).
function SignedIn() {
  const legal = useLegalGate()
  switch (legal.view) {
    case GATE_VIEW.app:
      return <AuthedRoutes />
    case GATE_VIEW.gate:
      return <LockedRoutes screen={<LegalGate status={legal.status} onAccept={legal.accept} />} />
    case GATE_VIEW.error:
      return (
        <LockedRoutes screen={
          <LegalCheckError error={legal.error} checking={legal.checking} onRetry={legal.retry} />
        } />
      )
    default:
      return <RingLoader fullScreen />
  }
}

export default function App() {
  const { session, loading, recovering } = useAuth()
  if (loading) {
    return <RingLoader fullScreen />
  }
  // A password-recovery link signs the user in, but they must set a new password
  // before doing anything else — so this screen preempts the normal routing.
  if (recovering) return <Suspense fallback={<RingLoader fullScreen />}><ResetPassword /></Suspense>
  return (
    <>
      <SkipLink />
      {session ? <SignedIn /> : <PublicRoutes />}
    </>
  )
}
