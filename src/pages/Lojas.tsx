import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BotaoLink, Carregando, Etiqueta, Titulo, Vazio, Aviso } from '../components/ui'
import { useLojas, useRepresentantes, useSaldosLoja } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_MODALIDADE, pacotes } from '../lib/formato'

export function Lojas() {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const lojas = useLojas()
  const saldos = useSaldosLoja()
  const representantes = useRepresentantes()
  const [busca, setBusca] = useState('')

  if (lojas.isPending) return <Carregando />
  if (lojas.error) return <Aviso erro={lojas.error} />

  const termo = busca.trim().toLowerCase()
  const visiveis = lojas.data.filter((l) => !termo || `${l.nome} ${l.bairro ?? ''}`.toLowerCase().includes(termo))
  const podeAbrir = ehGestao || Boolean(meuRepresentanteId)

  return (
    <div className="space-y-4">
      <Titulo apoio="Toque em uma loja para ver o saldo e registrar a visita.">Lojas</Titulo>

      {lojas.data.length > 5 && (
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou bairro"
          className="block min-h-12 w-full rounded-xl border border-marrom/25 bg-white/70 px-3 text-base"
        />
      )}

      {visiveis.length === 0 && <Vazio>{termo ? 'Nenhuma loja com esse nome.' : 'Nenhuma loja cadastrada ainda.'}</Vazio>}

      <ul className="space-y-2.5">
        {visiveis.map((loja) => {
          const total = (saldos.data ?? []).filter((s) => s.loja_id === loja.id).reduce((soma, s) => soma + s.saldo, 0)
          const representante = representantes.data?.find((r) => r.id === loja.representante_id)
          return (
            <li key={loja.id}>
              <Link to={`/lojas/${loja.id}`} className="block rounded-2xl border border-linha bg-papel p-4 active:bg-areia/25">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[17px] leading-snug font-bold">{loja.nome}</p>
                  {loja.status !== 'ativa' ? (
                    <Etiqueta tom="alerta">{loja.status === 'pausada' ? 'Pausada' : 'Encerrada'}</Etiqueta>
                  ) : (
                    <Etiqueta tom="verde">{NOME_MODALIDADE[loja.modalidade]}</Etiqueta>
                  )}
                </div>
                <p className="mt-1 text-sm text-marrom/70">
                  {[loja.bairro, ehGestao && representante?.nome].filter(Boolean).join(' · ') || loja.cidade}
                </p>
                {loja.modalidade !== 'compra_direta' && <p className="mt-2 text-sm font-semibold">{pacotes(total)} na loja</p>}
              </Link>
            </li>
          )
        })}
      </ul>

      {podeAbrir && (
        <BotaoLink para="/lojas/nova" variante="secundario" cheio>
          Cadastrar nova loja
        </BotaoLink>
      )}
    </div>
  )
}
