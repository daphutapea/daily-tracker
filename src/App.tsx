import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { SignIn } from './auth/SignIn'
import { useSession } from './auth/sessionContext'
import { AppShell } from './components/AppShell'
import { useTheme } from './lib/theme'
import { HomePage } from './pages/Home'

// Home is in the first download; every other page loads its code the first time you open it. The
// router waits for that code before switching, so the current page stays up instead of a blank
// "Loading" screen, and the page's code is cached after the first visit.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => async () => ({
  Component: (await load())[name],
})

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'tasks', lazy: page(() => import('./pages/Tasks'), 'TasksPage') },
      { path: 'notes', lazy: page(() => import('./pages/Notes'), 'NotesPage') },
      { path: 'notes/:noteId', lazy: page(() => import('./pages/Notes'), 'NotesPage') },
      { path: 'calendar', lazy: page(() => import('./pages/Calendar'), 'CalendarPage') },
      { path: 'review', lazy: page(() => import('./pages/Review'), 'ReviewPage') },
      { path: 'links', lazy: page(() => import('./pages/Links'), 'LinksPage') },
      { path: 'settings', lazy: page(() => import('./pages/Settings'), 'SettingsPage') },
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
        offset={{ bottom: 'var(--toast-bottom)', right: 24 }}
        mobileOffset={{ bottom: 'var(--toast-bottom)', left: 16, right: 16 }}
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
