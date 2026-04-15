import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LoadingState } from '../components/ui'
import ShellSkeleton from '../components/ShellSkeleton'
import {
  loadChatPage,
  loadDashboardPage,
  loadExerciseDetailPage,
  loadExercisesPage,
  loadHistoryPage,
  loadLoginPage,
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

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <LoadingState message="Sprawdzanie sesji..." />
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) return <LoadingState message="Sprawdzanie sesji..." />
  return !user ? <>{children}</> : <Navigate to="/dashboard" replace />
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<ShellSkeleton />}>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
          <Route path="/workout/new" element={<PrivateRoute><WorkoutPage /></PrivateRoute>} />
          <Route path="/workout/:id" element={<PrivateRoute><WorkoutDetailPage /></PrivateRoute>} />
          <Route path="/history" element={<PrivateRoute><HistoryPage /></PrivateRoute>} />
          <Route path="/templates" element={<PrivateRoute><TemplatesPage /></PrivateRoute>} />
          <Route path="/templates/new" element={<PrivateRoute><TemplateEditorPage /></PrivateRoute>} />
          <Route path="/templates/:id/edit" element={<PrivateRoute><TemplateEditorPage /></PrivateRoute>} />
          <Route path="/exercises" element={<PrivateRoute><ExercisesPage /></PrivateRoute>} />
          <Route path="/exercises/:source/:id" element={<PrivateRoute><ExerciseDetailPage /></PrivateRoute>} />
          <Route path="/progress" element={<PrivateRoute><ProgressPage /></PrivateRoute>} />
          <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
