import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Botao, Campo, Cartao, Carregando, Etiqueta, Titulo, Vazio } from '../components/ui'
import { useAcertos, useConfirmarPagamento, useLojas, useProdutos } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_MODALIDADE, data, hoje, reais } from '../lib/formato'
import type { Acerto, AcertoStatus } from '../lib/tipos'

const ABAS: { status: AcertoStatus; nome: string }[] = [
  { status: 'pendente', nome: 'Pendentes' },
  { status: 'confirmado', nome: 'Pagos' },
  { status: 'cancelado', nome: 'Cancelados' },
]

export function Acertos() {
  const { ehGestao } = useAcesso()
  const acertos = useAcertos()
  const lojas = useLojas()
  const produtos = useProdutos()
  const [aba, setAba] = useState<AcertoStatus>('pendente')

  if (acertos.isPending) return <Carregando />
  if (acertos.error) return <Aviso erro={acertos.error} />

  const lista = acertos.data.filter((a) => a.status === aba)
  const total = lista.reduce((s, a) => s + Number(a.valor_total), 0)

  return (
    <div className="space-y-4">
      <Titulo apoio="A loja paga por Pix à Viva Noz. Só a gestão confirma o recebimento.">Acertos</Titulo>

      <div className="flex rounded-xl border border-linha bg-papel p-1">
        {ABAS.map((a) => (
          <button
            key={a.status}
            type="button"
            onClick={() => setAba(a.status)}
            className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${aba === a.status ? 'bg-verde text-creme' : 'text-marrom/70'}`}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Vazio>Nenhum acerto aqui.</Vazio>
      ) : (
        <p className="text-sm text-marrom/75">
          {lista.length} {lista.length === 1 ? 'acerto' : 'acertos'} · <strong>{reais(total)}</strong>
        </p>
      )}

      {lista.map((a) => (
        <CartaoAcerto
          key={a.id}
          acerto={a}
          loja={lojas.data?.find((l) => l.id === a.loja_id)?.nome ?? 'Loja'}
          nomeProduto={(id) => produtos.data?.find((p) => p.id === id)?.nome_curto ?? '?'}
          podeConfirmar={ehGestao}
        />
      ))}
    </div>
  )
}

function CartaoAcerto({
  acerto,
  loja,
  nomeProduto,
  podeConfirmar,
}: {
  acerto: Acerto
  loja: string
  nomeProduto: (id: string) => string
  podeConfirmar: boolean
}) {
  const confirmar = useConfirmarPagamento()
  const [confirmando, setConfirmando] = useState(false)
  const [recebidoEm, setRecebidoEm] = useState(hoje())
  const pagamento = acerto.pagamentos[0]

  return (
    <Cartao>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link to={`/lojas/${acerto.loja_id}`} className="text-[17px] font-bold underline decoration-linha underline-offset-4">
            {loja}
          </Link>
          <p className="text-xs text-marrom/65">
            Visita de {data(acerto.criado_em)} · {NOME_MODALIDADE[acerto.modalidade]}
          </p>
        </div>
        <p className="text-xl font-bold whitespace-nowrap">{reais(acerto.valor_total)}</p>
      </div>

      <ul className="mt-3 space-y-0.5 text-sm text-marrom/80">
        {acerto.acerto_itens.map((i) => (
          <li key={i.produto_id} className="flex justify-between">
            <span>
              {nomeProduto(i.produto_id)} · {i.quantidade} x {reais(i.preco_unitario)}
            </span>
            <span>{reais(i.subtotal)}</span>
          </li>
        ))}
      </ul>

      {acerto.status === 'confirmado' && pagamento && (
        <div className="mt-3">
          <Etiqueta tom="verde">Pix recebido em {data(pagamento.recebido_em)}</Etiqueta>
        </div>
      )}

      {acerto.status === 'pendente' && podeConfirmar && !confirmando && (
        <div className="mt-3">
          <Botao variante="secundario" cheio onClick={() => setConfirmando(true)}>
            Confirmar Pix recebido
          </Botao>
        </div>
      )}

      {confirmando && acerto.status === 'pendente' && (
        <div className="mt-3 space-y-3 border-t border-linha pt-3">
          <p className="text-sm">
            Confira no extrato do banco se entrou um Pix de <strong>{reais(acerto.valor_total)}</strong> desta loja. A confirmação não pode ser desfeita.
          </p>
          <Campo rotulo="Data em que o Pix entrou" type="date" max={hoje()} value={recebidoEm} onChange={(e) => setRecebidoEm(e.target.value)} />
          <Aviso erro={confirmar.error} />
          <Botao
            cheio
            disabled={confirmar.isPending || !recebidoEm}
            onClick={() => confirmar.mutate({ acertoId: acerto.id, valor: Number(acerto.valor_total), recebidoEm })}
          >
            {confirmar.isPending ? 'Confirmando.' : `Confirmar ${reais(acerto.valor_total)}`}
          </Botao>
          <Botao variante="discreto" cheio onClick={() => setConfirmando(false)}>
            Cancelar
          </Botao>
        </div>
      )}
    </Cartao>
  )
}
