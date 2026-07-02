import { Navigate, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardPage from './pages/DashboardPage';

const SleepPage = lazy(() => import('./pages/SleepPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const WorkoutsPage = lazy(() => import('./pages/WorkoutsPage'));
const WorkoutDetailPage = lazy(() => import('./pages/WorkoutDetailPage'));

function PageFallback() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-zinc-900 rounded" />
      <div className="h-64 bg-zinc-900 rounded-lg" />
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <Page>
              <GoalsPage />
            </Page>
          }
        />
        <Route
          path="/goals"
          element={
            <Page>
              <GoalsPage />
            </Page>
          }
        />
        <Route
          path="/calendar"
          element={
            <Page>
              <CalendarPage />
            </Page>
          }
        />
        <Route
          path="/sleep"
          element={
            <Page>
              <SleepPage />
            </Page>
          }
        />
        <Route
          path="/workouts"
          element={
            <Page>
              <WorkoutsPage />
            </Page>
          }
        />
        <Route
          path="/workouts/:id"
          element={
            <Page>
              <WorkoutDetailPage />
            </Page>
          }
        />
        <Route path="/metrics" element={<Navigate to="/raw" replace />} />
        <Route
          path="/raw"
          element={
            <Page>
              <DashboardPage />
            </Page>
          }
        />
      </Routes>
    </Layout>
  );
}
