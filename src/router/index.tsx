import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LoadingState } from '../components/ui'

const LoginPage = lazy(() => import('../pages/LoginPage'))
const RegisterPage = lazy(() => import('../pages/RegisterPage'))
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const OnboardingPage = lazy(() => import('../pages/OnboardingPage'))
const WorkoutPage = lazy(() => import('../pages/WorkoutPage'))
const WorkoutDetailPage = lazy(() => import('../pages/WorkoutDetailPage'))
const ProfilePage = lazy(() => import('../pages/ProfilePage'))
const ExercisesPage = lazy(() => import('../pages/ExercisesPage'))
const ExerciseDetailPage = lazy(() => import('../pages/ExerciseDetailPage'))

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
      <Suspense fallback={<LoadingState message="Ładowanie widoku..." />}>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
          <Route path="/workout/new" element={<PrivateRoute><WorkoutPage /></PrivateRoute>} />
          <Route path="/workout/:id" element={<PrivateRoute><WorkoutDetailPage /></PrivateRoute>} />
          <Route path="/exercises" element={<PrivateRoute><ExercisesPage /></PrivateRoute>} />
          <Route path="/exercises/:source/:id" element={<PrivateRoute><ExerciseDetailPage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
