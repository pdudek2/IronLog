import { lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LoadingState } from '../components/ui'
import AppLayout from '../components/AppLayout'
import AnalyticsListener from '../components/AnalyticsListener'
import {
  loadChatPage,
  loadDashboardPage,
  loadExerciseDetailPage,
  loadExercisesPage,
  loadHistoryPage,
  loadLoginPage,
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

function PrivateRouteOutlet() {
  const { user, loading } = useAuthStore()
  if (loading) return <LoadingState message="Sprawdzanie sesji..." />
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
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

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AnalyticsListener />
      <RouteScrollReset />
      <Routes>
        {/* Public (auth) routes — no AppShell */}
        <Route element={<PublicRouteOutlet />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Private routes */}
        <Route element={<PrivateRouteOutlet />}>
          {/* Onboarding does not live inside the shared AppLayout */}
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* Everything else shares a single AppLayout instance. TopNav and
              BottomNav render once here and stay mounted across route changes. */}
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

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
