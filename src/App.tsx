import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { ToastProvider } from '@/components/Toast';
import { useProfile, useSettings } from '@/hooks/useData';
import { useApplyTheme } from '@/hooks/useTheme';
import { ensureSeed } from '@/db/seed/seed';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { MorePage } from '@/features/placeholder/MorePage';
import { UpdatePrompt } from '@/features/settings/UpdatePrompt';
import { RemindersOnOpen } from '@/features/reminders/RemindersOnOpen';

// Pages secondaires chargées à la demande.
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const InstallPage = lazy(() => import('@/features/install/InstallPage').then((m) => ({ default: m.InstallPage })));
const WorkoutsPage = lazy(() => import('@/features/workouts/WorkoutsPage').then((m) => ({ default: m.WorkoutsPage })));
const LiveWorkoutPage = lazy(() => import('@/features/workouts/LiveWorkoutPage').then((m) => ({ default: m.LiveWorkoutPage })));
const ProgramEditorPage = lazy(() => import('@/features/workouts/ProgramEditorPage').then((m) => ({ default: m.ProgramEditorPage })));
const ExerciseDetailPage = lazy(() => import('@/features/workouts/ExerciseDetailPage').then((m) => ({ default: m.ExerciseDetailPage })));
const RunningPage = lazy(() => import('@/features/running/RunningPage').then((m) => ({ default: m.RunningPage })));
const GpsRunPage = lazy(() => import('@/features/running/GpsRunPage').then((m) => ({ default: m.GpsRunPage })));
const RunDetailPage = lazy(() => import('@/features/running/RunDetailPage').then((m) => ({ default: m.RunDetailPage })));
const NutritionPage = lazy(() => import('@/features/nutrition/NutritionPage').then((m) => ({ default: m.NutritionPage })));
const CoachPage = lazy(() => import('@/features/coach/CoachPage').then((m) => ({ default: m.CoachPage })));
const ProgressPage = lazy(() => import('@/features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const PlanningPage = lazy(() => import('@/features/planning/PlanningPage').then((m) => ({ default: m.PlanningPage })));

const FOCUS_ROUTES = ['/course/gps'];

/** Pages principales : exigent un profil, sinon redirection vers l'onboarding. */
function AppLayout() {
  const profile = useProfile();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  if (profile === undefined) return null;
  if (profile === null) return <Navigate to="/bienvenue" replace />;
  return (
    <div className="min-h-dvh pl-safe pr-safe">
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      {/* L'écran GPS a ses propres commandes en bas : pas de barre d'onglets pour éviter les erreurs de toucher. */}
      {!FOCUS_ROUTES.includes(pathname) && <BottomNav />}
      {!FOCUS_ROUTES.includes(pathname) && <RemindersOnOpen />}
    </div>
  );
}

function OnboardingRoute() {
  const profile = useProfile();
  if (profile === undefined) return null;
  if (profile) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={null}>
      <OnboardingPage />
    </Suspense>
  );
}

export function App() {
  const settings = useSettings();
  useApplyTheme(settings?.theme);
  // Exercices et programmes de base (idempotent ; relancé aussi après une restauration).
  useEffect(() => {
    void ensureSeed();
  }, [settings?.seedVersion]);
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route path="/bienvenue" element={<OnboardingRoute />} />
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="muscu" element={<WorkoutsPage />} />
            <Route path="muscu/seance/:id" element={<LiveWorkoutPage />} />
            <Route path="muscu/programme/:id" element={<ProgramEditorPage />} />
            <Route path="muscu/exercice/:id" element={<ExerciseDetailPage />} />
            <Route path="course" element={<RunningPage />} />
            <Route path="course/gps" element={<GpsRunPage />} />
            <Route path="course/:id" element={<RunDetailPage />} />
            <Route path="planning" element={<PlanningPage />} />
            <Route path="progres" element={<ProgressPage />} />
            <Route path="rapports" element={<ReportsPage />} />
            <Route path="nutrition" element={<NutritionPage />} />
            <Route path="coach" element={<CoachPage />} />
            <Route path="plus" element={<MorePage />} />
            <Route path="profil" element={<ProfilePage />} />
            <Route path="parametres" element={<SettingsPage />} />
            <Route path="installer" element={<InstallPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
      <UpdatePrompt />
    </ToastProvider>
  );
}
