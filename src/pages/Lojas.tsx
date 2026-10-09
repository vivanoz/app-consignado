import { useState } from 'react'
import { CartaoLoja } from '../components/CartaoLoja'
import { Aviso, BotaoLink, Carregando, Titulo, Vazio } from '../components/ui'
import { useRepresentantes } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { porUrgencia, useResumoLojas } from '../lib/resumo'

type Filtro = 'ativas' | 'repor' | 'minhas' | 'todas'

export function Lojas() {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const { resumo, carregando, erro } = useResumoLojas()
  const representantes = useRepresentantes()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('ativas')

  if (carregando) return <Carregando />
  if (erro) return <Aviso erro={erro} />

  // A gestão vê as lojas de todos; quem também faz visitas pode separar as suas.
  const filtros: { id: Filtro; nome: string }[] = [
    { id: 'ativas', nome: 'Ativas' },
    { id: 'repor', nome: `Repor (${resumo.filter((r) => r.precisaRepor).length})` },
    ...(ehGestao && meuRepresentanteId ? [{ id: 'minhas' as Filtro, nome: 'Minhas' }] : []),
    { id: 'todas', nome: 'Todas' },
  ]

  const termo = busca.trim().toLowerCase()
  const visiveis = resumo
    .filter((r) => {
      if (filtro === 'ativas') return r.loja.status === 'ativa'
      if (filtro === 'repor') return r.precisaRepor
      if (filtro === 'minhas') return r.loja.representante_id === meuRepresentanteId && r.loja.status === 'ativa'
      return true
    })
    .filter((r) => !termo || `${r.loja.nome} ${r.loja.bairro ?? ''}`.toLowerCase().includes(termo))
    .sort(porUrgencia)

  return (
    <div className="space-y-4">
      <Titulo apoio="As lojas que precisam de reposição aparecem primeiro.">Clientes</Titulo>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-linha bg-papel p-1">
        {filtros.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`min-h-10 flex-1 rounded-lg px-3 text-sm font-semibold whitespace-nowrap ${filtro === f.id ? 'bg-verde text-creme' : 'text-marrom/70'}`}
          >
            {f.nome}
          </button>
        ))}
      </div>

      {resumo.length > 6 && (
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou bairro"
          className="block min-h-12 w-full rounded-xl border border-marrom/25 bg-white/70 px-3 text-base"
        />
      )}

      {visiveis.length === 0 && (
        <Vazio>{resumo.length === 0 ? 'Nenhuma loja cadastrada ainda.' : filtro === 'repor' ? 'Nenhuma loja precisando de reposição.' : 'Nenhuma loja aqui.'}</Vazio>
      )}

      <ul className="space-y-2.5">
        {visiveis.map((r) => (
          <li key={r.loja.id}>
            <CartaoLoja resumo={r} representante={ehGestao ? representantes.data?.find((x) => x.id === r.loja.representante_id)?.nome : undefined} />
          </li>
        ))}
      </ul>

      {(ehGestao || meuRepresentanteId) && (
        <BotaoLink para="/lojas/nova" variante="secundario" cheio>
          Cadastrar nova loja
        </BotaoLink>
      )}
    </div>
  )
}
