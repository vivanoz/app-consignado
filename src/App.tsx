import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Carregando } from './components/ui'
import { useAcesso } from './lib/auth'
import { configurado } from './lib/supabase'
import { DefinirSenha, Entrada, SemAcesso, SemConfiguracao } from './pages/Entrada'
import { Estoque } from './pages/Estoque'
import { Financeiro } from './pages/Financeiro'
import { Inicio } from './pages/Inicio'
import { LojaDetalhe } from './pages/LojaDetalhe'
import { LojaForm } from './pages/LojaForm'
import { Lojas } from './pages/Lojas'
import { Equipe } from './pages/Equipe'
import { Mais, Precos } from './pages/Mais'
import { NovaVisita } from './pages/NovaVisita'

export function App() {
  const { carregando, sessao, papel, ehGestao, precisaDefinirSenha } = useAcesso()

  if (!configurado) return <SemConfiguracao />
  if (carregando) return <Carregando />
  if (!sessao) return <Entrada />
  if (precisaDefinirSenha) return <DefinirSenha />
  if (!papel) return <SemAcesso />

  const comLojas = papel !== 'producao'

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="estoque" element={<Estoque />} />
        <Route path="mais" element={<Mais />} />
        {comLojas && (
          <>
            <Route path="lojas" element={<Lojas />} />
            <Route path="lojas/nova" element={<LojaForm />} />
            <Route path="lojas/:id" element={<LojaDetalhe />} />
            <Route path="lojas/:id/editar" element={<LojaForm />} />
            <Route path="lojas/:id/visita" element={<NovaVisita />} />
            <Route path="financeiro" element={<Financeiro />} />
          </>
        )}
        {ehGestao && (
          <>
            <Route path="mais/precos" element={<Precos />} />
            <Route path="mais/equipe" element={<Equipe />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
