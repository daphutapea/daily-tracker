import '@fontsource-variable/ibm-plex-sans'
import './index.css'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { App } from './App'
import './lib/motion'
import { SessionProvider } from './auth/session'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      // Marked so `quietly()` handlers know the person has already been told.
      ;(error as Error & { handled?: boolean }).handled = true
      toast.error(error.message || 'Something went wrong. Try again.')
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
