import { lazy, Suspense, useEffect } from 'react'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  useLocation,
} from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useProfileStore } from '../store/profileStore'
import { ActionFeedback } from '../components/ActionFeedback'
import { LoadingState } from '../components/ui'
import AppLayout from '../components/AppLayout'
import {
  loadChatPage,
  loadDashboardPage,
  loadExerciseDetailPage,
  loadExercisesPage,
  loadHistoryPage,
  loadLoginPage,
  loadLogoutPage,
  loadNotFoundPage,
  loadOnboardingPage,
  loadProfilePage,
  loadProgressPage,
  loadRegisterPage,
  loadTemplateEditorPage,
  loadTemplatesPage,
  loadWorkoutDetailPage,
  loadWorkoutPage,
} from './pageLoaders'

const LoginPage = lazy(loadLoginPage)
const LogoutPage = lazy(loadLogoutPage)
const RegisterPage = lazy(loadRegisterPage)
const DashboardPage = lazy(loadDashboardPage)
const OnboardingPage = lazy(loadOnboardingPage)
const WorkoutPage = lazy(loadWorkoutPage)
const WorkoutDetailPage = lazy(loadWorkoutDetailPage)
const HistoryPage = lazy(loadHistoryPage)
const ProfilePage = lazy(loadProfilePage)
const ExercisesPage = lazy(loadExercisesPage)
const ExerciseDetailPage = lazy(loadExerciseDetailPage)
const TemplatesPage = lazy(loadTemplatesPage)
const TemplateEditorPage = lazy(loadTemplateEditorPage)
const ProgressPage = lazy(loadProgressPage)
const ChatPage = lazy(loadChatPage)
const NotFoundPage = lazy(loadNotFoundPage)

function LogoutRoute() {
  return (
    <Suspense fallback={<LoadingState message="Wylogowywanie..." />}>
      <LogoutPage />
    </Suspense>
  )
}

function PrivateRouteOutlet() {
  const { user, loading } = useAuthStore()
  if (loading) return <LoadingState message="Sprawdzanie sesji..." />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function ProfileRouteOutlet() {
  const { user } = useAuthStore()
  const location = useLocation()
  const { profileUid, status, loadProfile } = useProfileStore()

  useEffect(() => {
    if (user && profileUid !== user.uid) void loadProfile(user.uid)
  }, [loadProfile, profileUid, user])

  if (!user || profileUid !== user.uid || status === 'loading') {
    return <LoadingState message="Wczytywanie profilu..." />
  }

  if (status === 'error') {
    return (
      <div className="page-shell flex items-center justify-center">
        <div className="page-container max-w-lg">
          <ActionFeedback
            status="error"
            message="Nie udało się wczytać profilu. Sprawdź połączenie i spróbuj ponownie."
            onRetry={() => { void loadProfile(user.uid) }}
          />
        </div>
      </div>
    )
  }

  if (status === 'missing') {
    return location.pathname === '/onboarding'
      ? <Outlet />
      : <Navigate to="/onboarding" replace />
  }

  return location.pathname === '/onboarding'
    ? <Navigate to="/dashboard" replace />
    : <Outlet />
}

function PublicRouteOutlet() {
  const { user, loading } = useAuthStore()
  if (loading) return <LoadingState message="Sprawdzanie sesji..." />
  if (user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function RouteScrollReset() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    if (hash) {
      window.requestAnimationFrame(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
      })
      return
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname, hash])

  return null
}

function RootRoute() {
  return (
    <>
      <RouteScrollReset />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<RootRoute />}>
    <Route element={<PublicRouteOutlet />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
    </Route>
    <Route element={<PrivateRouteOutlet />}>
      <Route path="/logout" element={<LogoutRoute />} />
      <Route element={<ProfileRouteOutlet />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/new" element={<TemplateEditorPage />} />
          <Route path="/templates/:id/edit" element={<TemplateEditorPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/exercises/:source/:id" element={<ExerciseDetailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/workout/new" element={<WorkoutPage />} />
          <Route path="/workout/:id" element={<WorkoutDetailPage />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Route>,
))

export default function AppRouter() {
  return <RouterProvider router={router} />
}
