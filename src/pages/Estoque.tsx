import { useState } from 'react'
import { AreaDeTexto, Aviso, Botao, Cartao, Carregando, Contador, Rotulo, SaldoPorProduto, Selecao, Titulo, Vazio } from '../components/ui'
import { useLojas, useMovimentacoes, useMovimentarEstoque, useProdutos, useRepresentantes, useSaldosRepresentante } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_MOVIMENTO, dataHora, pacotes } from '../lib/formato'

export function Estoque() {
  const { papel, meuRepresentanteId } = useAcesso()
  const produtos = useProdutos()
  const representantes = useRepresentantes()
  const saldos = useSaldosRepresentante()
  const [lancando, setLancando] = useState<'retirada' | 'devolucao' | null>(null)

  if (produtos.isPending || representantes.isPending || saldos.isPending) return <Carregando />

  const entrega = papel === 'gestao' || papel === 'producao'
  const saldoDe = (representanteId: string) =>
    (produtos.data ?? []).map((p) => ({
      nome: p.nome_curto,
      quantidade: (saldos.data ?? []).find((s) => s.representante_id === representanteId && s.produto_id === p.id)?.saldo ?? 0,
    }))

  if (lancando) return <Lancamento tipo={lancando} aoFechar={() => setLancando(null)} />

  return (
    <div className="space-y-4">
      <Titulo apoio="Produto retirado na fábrica e ainda não colocado em loja.">Estoque</Titulo>

      {representantes.data?.length === 0 && <Vazio>Nenhum representante cadastrado.</Vazio>}

      {representantes.data
        ?.filter((r) => r.ativo || saldoDe(r.id).some((s) => s.quantidade !== 0))
        .map((r) => (
          <Cartao key={r.id}>
            <Rotulo>{r.id === meuRepresentanteId ? 'Com você' : r.nome}</Rotulo>
            <div className="mt-3">
              <SaldoPorProduto itens={saldoDe(r.id)} />
            </div>
          </Cartao>
        ))}

      {entrega && (
        <div className="grid grid-cols-2 gap-3">
          <Botao onClick={() => setLancando('retirada')}>Registrar retirada</Botao>
          <Botao variante="secundario" onClick={() => setLancando('devolucao')}>
            Registrar devolução
          </Botao>
        </div>
      )}

      {meuRepresentanteId && <Extrato representanteId={meuRepresentanteId} />}
    </div>
  )
}

function Extrato({ representanteId }: { representanteId: string }) {
  const movimentos = useMovimentacoes(representanteId)
  const produtos = useProdutos()
  const lojas = useLojas()

  return (
    <section className="space-y-2.5">
      <Rotulo>Últimas movimentações</Rotulo>
      {movimentos.data?.length === 0 && <Vazio>Nada por aqui ainda.</Vazio>}
      {movimentos.data && movimentos.data.length > 0 && (
        <Cartao className="divide-y divide-linha py-1">
          {movimentos.data.map((m) => {
            const entrada = m.destino === 'representante'
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {NOME_MOVIMENTO[m.tipo]} · {produtos.data?.find((p) => p.id === m.produto_id)?.nome_curto}
                  </p>
                  <p className="truncate text-xs text-marrom/65">
                    {[dataHora(m.ocorrido_em), lojas.data?.find((l) => l.id === m.loja_id)?.nome, m.motivo].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className={`text-lg font-bold ${entrada ? 'text-verde' : 'text-marrom'}`}>
                  {entrada ? '+' : '−'}
                  {m.quantidade}
                </p>
              </div>
            )
          })}
        </Cartao>
      )}
    </section>
  )
}

function Lancamento({ tipo, aoFechar }: { tipo: 'retirada' | 'devolucao'; aoFechar: () => void }) {
  const produtos = useProdutos()
  const representantes = useRepresentantes()
  const saldos = useSaldosRepresentante()
  const movimentar = useMovimentarEstoque()
  // Criado uma vez por lançamento: tentar de novo não duplica.
  const [operacaoId] = useState(() => crypto.randomUUID())
  const [representanteId, setRepresentanteId] = useState('')
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [observacao, setObservacao] = useState('')

  const retirada = tipo === 'retirada'
  const total = Object.values(quantidades).reduce((s, n) => s + n, 0)
  const saldo = (produtoId: string) =>
    saldos.data?.find((s) => s.representante_id === representanteId && s.produto_id === produtoId)?.saldo ?? 0

  async function enviar() {
    await movimentar.mutateAsync({
      tipo,
      operacaoId,
      representanteId,
      itens: Object.entries(quantidades).map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
      observacao,
    })
    aoFechar()
  }

  return (
    <div className="space-y-4">
      <Titulo apoio={retirada ? 'O representante leva produto da fábrica.' : 'O representante devolve produto à fábrica.'}>
        {retirada ? 'Retirada' : 'Devolução'}
      </Titulo>

      <Selecao rotulo="Representante" value={representanteId} onChange={(e) => { setRepresentanteId(e.target.value); setQuantidades({}) }}>
        <option value="">Escolha</option>
        {representantes.data?.filter((r) => r.ativo).map((r) => (
          <option key={r.id} value={r.id}>
            {r.nome}
          </option>
        ))}
      </Selecao>

      {representanteId && (
        <Cartao>
          {produtos.data?.filter((p) => p.ativo || saldo(p.id) > 0).map((p) => (
            <Contador
              key={p.id}
              rotulo={p.nome_curto}
              apoio={`tem ${saldo(p.id)}`}
              valor={quantidades[p.id] ?? 0}
              maximo={retirada ? undefined : saldo(p.id)}
              aoMudar={(n) => setQuantidades((q) => ({ ...q, [p.id]: n }))}
            />
          ))}
        </Cartao>
      )}

      <AreaDeTexto rotulo="Observação" valor={observacao} aoMudar={setObservacao} dica="Opcional." />
      <Aviso erro={movimentar.error} />
      <Botao cheio disabled={!representanteId || total === 0 || movimentar.isPending} onClick={enviar}>
        {movimentar.isPending ? 'Gravando.' : `Gravar ${retirada ? 'retirada' : 'devolução'} de ${pacotes(total)}`}
      </Botao>
      <Botao variante="secundario" cheio onClick={aoFechar}>
        Cancelar
      </Botao>
    </div>
  )
}
