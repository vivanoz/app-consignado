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
import { registerSW } from 'virtual:pwa-register'

// O app fica aberto por horas no celular. Procura versão nova a cada 10
// minutos e sempre que a pessoa volta para ele; achando, recarrega sozinho.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const procurar = () => registro.update().catch(() => {})
    setInterval(procurar, 10 * 60_000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && procurar())
  },
})

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
