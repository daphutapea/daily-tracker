import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { SignIn } from './auth/SignIn'
import { useSession } from './auth/session'
import { AppShell } from './components/AppShell'
import { useTheme } from './lib/theme'
import { CalendarPage } from './pages/Calendar'
import { HomePage } from './pages/Home'
import { LinksPage } from './pages/Links'
import { NotesPage } from './pages/Notes'
import { SettingsPage } from './pages/Settings'
import { lazy, Suspense } from 'react'

// The board's drag-and-drop library only loads when Tasks is opened.
const TasksPage = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.TasksPage })))

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'tasks',
        element: (
          <Suspense fallback={<p className="py-8 text-center text-ink-3">Loading tasks…</p>}>
            <TasksPage />
          </Suspense>
        ),
      },
      { path: 'notes', element: <NotesPage /> },
      { path: 'notes/:noteId', element: <NotesPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'links', element: <LinksPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export function App() {
  const session = useSession()
  const theme = useTheme()
  return (
    <>
      {session.status === 'loading' ? (
        <div className="grid min-h-dvh place-items-center text-ink-3" role="status">
          Loading your tracker…
        </div>
      ) : session.status === 'signed-out' ? (
        <SignIn />
      ) : (
        <RouterProvider router={router} />
      )}
      <Toaster
        position="bottom-right"
        theme={theme.scheme}
        closeButton
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />
    </>
  )
}
