import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/manrope'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/500-italic.css'
import './index.css'
import { App } from './App'
import { ProvedorDeAcesso } from './lib/auth'

const cache = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <ProvedorDeAcesso>
        <HashRouter>
          <App />
        </HashRouter>
      </ProvedorDeAcesso>
    </QueryClientProvider>
  </StrictMode>,
)
