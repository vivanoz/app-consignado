import { useState } from 'react'
import { Foto } from '../components/arquivos'
import { AreaDeTexto, Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, Contador, Rotulo, SaldoPorProduto, Selecao, Titulo, Vazio } from '../components/ui'
import {
  useLojas,
  useMovimentacoes,
  useMovimentarEstoque,
  useProdutos,
  useRegistrarProducao,
  useRepresentantes,
  useSaldosFabrica,
  useSaldosRepresentante,
} from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_MOVIMENTO, dataHora, hoje, pacotes } from '../lib/formato'

type Lancando = 'producao' | 'retirada' | 'devolucao' | null

export function Estoque() {
  const { papel, meuRepresentanteId } = useAcesso()
  const fabrica = papel === 'gestao' || papel === 'producao'
  const produtos = useProdutos()
  const representantes = useRepresentantes()
  const saldos = useSaldosRepresentante()
  const saldosFabrica = useSaldosFabrica(fabrica)
  const [lancando, setLancando] = useState<Lancando>(null)

  if (produtos.isPending || representantes.isPending || saldos.isPending) return <Carregando />

  const saldoDe = (representanteId: string) =>
    (produtos.data ?? []).map((p) => ({
      nome: p.nome_curto,
      quantidade: (saldos.data ?? []).find((s) => s.representante_id === representanteId && s.produto_id === p.id)?.saldo ?? 0,
    }))
  const naFabrica = (produtos.data ?? []).map((p) => ({
    nome: p.nome_curto,
    quantidade: (saldosFabrica.data ?? []).find((s) => s.produto_id === p.id)?.saldo ?? 0,
  }))

  if (lancando === 'producao') return <Producao aoFechar={() => setLancando(null)} />
  if (lancando) return <Lancamento tipo={lancando} aoFechar={() => setLancando(null)} />

  return (
    <div className="space-y-4">
      <Titulo apoio="Onde está cada pacote: na fábrica e com quem saiu para repor ou vender.">Estoque</Titulo>

      {fabrica && (
        <Cartao>
          <Rotulo>Na fábrica</Rotulo>
          <div className="mt-3">
            <SaldoPorProduto itens={naFabrica} />
          </div>
          {naFabrica.some((s) => s.quantidade < 0) && (
            <p className="mt-2 text-xs text-alerta">Saldo negativo: saiu mais do que foi lançado como produzido. Registre a produção que falta.</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Botao onClick={() => setLancando('producao')}>Registrar produção</Botao>
            <Botao variante="secundario" onClick={() => setLancando('retirada')}>
              Registrar retirada
            </Botao>
          </div>
        </Cartao>
      )}

      {representantes.data?.length === 0 && <Vazio>Ninguém cadastrado para fazer visitas ou vender.</Vazio>}

      {representantes.data
        ?.filter((r) => r.ativo || saldoDe(r.id).some((s) => s.quantidade !== 0))
        .map((r) => (
          <Cartao key={r.id}>
            <div className="flex items-center gap-3">
              <Foto caminho={r.foto_path} nome={r.nome} className="size-10 shrink-0 text-sm" />
              <Rotulo>{r.id === meuRepresentanteId ? 'Com você' : `Com ${r.nome}`}</Rotulo>
            </div>
            <div className="mt-3">
              <SaldoPorProduto itens={saldoDe(r.id)} />
            </div>
          </Cartao>
        ))}

      {meuRepresentanteId && (
        <BotaoLink para="/varejo" cheio>
          Registrar venda varejo
        </BotaoLink>
      )}

      {fabrica && (
        <Botao variante="secundario" cheio onClick={() => setLancando('devolucao')}>
          Registrar devolução à fábrica
        </Botao>
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
                    {NOME_MOVIMENTO[m.tipo] ?? m.tipo} · {produtos.data?.find((p) => p.id === m.produto_id)?.nome_curto}
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

// Lote produzido: os pacotes entram no estoque da fábrica.
function Producao({ aoFechar }: { aoFechar: () => void }) {
  const { meuRepresentanteId } = useAcesso()
  const produtos = useProdutos()
  const registrar = useRegistrarProducao()
  // Identificadores criados uma vez: tentar de novo não duplica o lote.
  const [ids] = useState(() => ({ retirada: crypto.randomUUID(), porProduto: {} as Record<string, string> }))
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [produzidoEm, setProduzidoEm] = useState(hoje())
  const [validade, setValidade] = useState('')
  const [ficaComigo, setFicaComigo] = useState(false)
  const [canal, setCanal] = useState<'loja' | 'varejo'>('loja')

  const total = Object.values(quantidades).reduce((s, n) => s + n, 0)

  async function enviar() {
    const itens = Object.entries(quantidades)
      .filter(([, quantidade]) => quantidade > 0)
      .map(([produtoId, quantidade]) => ({
        operacaoId: (ids.porProduto[produtoId] ??= crypto.randomUUID()),
        produtoId,
        quantidade,
      }))
    await registrar.mutateAsync({
      itens,
      produzidoEm,
      validade: validade || null,
      canal,
      retirar: ficaComigo && meuRepresentanteId ? { operacaoId: ids.retirada, representanteId: meuRepresentanteId } : null,
    })
    aoFechar()
  }

  return (
    <div className="space-y-4">
      <Titulo apoio="Informe quantos pacotes ficaram prontos de cada sabor.">Produção</Titulo>

      <Cartao>
        {produtos.data?.filter((p) => p.ativo).map((p) => (
          <Contador key={p.id} rotulo={p.nome_curto} valor={quantidades[p.id] ?? 0} aoMudar={(n) => setQuantidades((q) => ({ ...q, [p.id]: n }))} />
        ))}
      </Cartao>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Produzido em" type="date" max={hoje()} value={produzidoEm} onChange={(e) => setProduzidoEm(e.target.value)} />
        <Campo rotulo="Validade (opcional)" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
      </div>

      <Selecao rotulo="Embalado para" value={canal} onChange={(e) => setCanal(e.target.value as 'loja' | 'varejo')}>
        <option value="loja">Loja (consignado e compra direta)</option>
        <option value="varejo">Venda varejo</option>
      </Selecao>
      <p className="-mt-2 text-xs text-marrom/65">Define quais adesivos saem do estoque de insumos. As castanhas e a embalagem saem pela receita de cada sabor.</p>

      {meuRepresentanteId && (
        <label className="flex items-start gap-3 rounded-2xl border border-linha bg-papel p-4 text-sm">
          <input type="checkbox" checked={ficaComigo} onChange={(e) => setFicaComigo(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#455020]" />
          <span>
            <strong>Já fica comigo.</strong> Além de entrar na fábrica, o lote vai direto para o meu estoque, para eu repor loja ou vender no varejo.
          </span>
        </label>
      )}

      <Aviso erro={registrar.error} />
      <Botao cheio disabled={total === 0 || !produzidoEm || registrar.isPending} onClick={enviar}>
        {registrar.isPending ? 'Gravando.' : `Gravar produção de ${pacotes(total)}`}
      </Botao>
      <Botao variante="secundario" cheio onClick={aoFechar}>
        Cancelar
      </Botao>
    </div>
  )
}

function Lancamento({ tipo, aoFechar }: { tipo: 'retirada' | 'devolucao'; aoFechar: () => void }) {
  const { meuRepresentanteId } = useAcesso()
  const produtos = useProdutos()
  const representantes = useRepresentantes()
  const saldos = useSaldosRepresentante()
  const saldosFabrica = useSaldosFabrica()
  const movimentar = useMovimentarEstoque()
  const produzir = useRegistrarProducao()
  // Criado uma vez por lançamento: tentar de novo não duplica.
  const [operacaoId] = useState(() => crypto.randomUUID())
  const [idsProducao] = useState<Record<string, string>>({})
  // Pacote que sai e não estava lançado como produzido: produz na hora, para
  // a fábrica não ficar negativa e os insumos serem descontados.
  const [produzirFalta, setProduzirFalta] = useState(true)
  const [canal, setCanal] = useState<'loja' | 'varejo'>('loja')
  const [representanteId, setRepresentanteId] = useState(meuRepresentanteId ?? '')
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [observacao, setObservacao] = useState('')

  const retirada = tipo === 'retirada'
  const total = Object.values(quantidades).reduce((s, n) => s + n, 0)
  const saldo = (produtoId: string) =>
    saldos.data?.find((s) => s.representante_id === representanteId && s.produto_id === produtoId)?.saldo ?? 0
  const naFabrica = (produtoId: string) => saldosFabrica.data?.find((s) => s.produto_id === produtoId)?.saldo ?? 0
  const alemDaFabrica = retirada && (produtos.data ?? []).some((p) => (quantidades[p.id] ?? 0) > Math.max(0, naFabrica(p.id)))

  const faltas = retirada
    ? (produtos.data ?? [])
        .map((p) => ({ produtoId: p.id, quantidade: Math.max(0, (quantidades[p.id] ?? 0) - Math.max(0, naFabrica(p.id))) }))
        .filter((f) => f.quantidade > 0)
    : []

  async function enviar() {
    if (faltas.length > 0 && produzirFalta) {
      await produzir.mutateAsync({
        itens: faltas.map((f) => ({ ...f, operacaoId: (idsProducao[f.produtoId] ??= crypto.randomUUID()) })),
        produzidoEm: hoje(),
        validade: null,
        canal,
        retirar: null,
      })
    }
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
      <Titulo apoio={retirada ? 'Produto que sai da fábrica com alguém, para repor loja ou vender.' : 'Produto que volta para a fábrica.'}>
        {retirada ? 'Retirada' : 'Devolução'}
      </Titulo>

      <Selecao rotulo="Quem leva" value={representanteId} onChange={(e) => { setRepresentanteId(e.target.value); setQuantidades({}) }}>
        <option value="">Escolha</option>
        {representantes.data?.filter((r) => r.ativo).map((r) => (
          <option key={r.id} value={r.id}>
            {r.id === meuRepresentanteId ? `${r.nome} (você)` : r.nome}
          </option>
        ))}
      </Selecao>

      {representanteId && (
        <Cartao>
          {produtos.data?.filter((p) => p.ativo || saldo(p.id) > 0).map((p) => (
            <Contador
              key={p.id}
              rotulo={p.nome_curto}
              apoio={retirada ? `já tem ${saldo(p.id)} · fábrica ${naFabrica(p.id)}` : `tem ${saldo(p.id)}`}
              valor={quantidades[p.id] ?? 0}
              maximo={retirada ? undefined : saldo(p.id)}
              aoMudar={(n) => setQuantidades((q) => ({ ...q, [p.id]: n }))}
            />
          ))}
        </Cartao>
      )}

      {alemDaFabrica && (
        <div className="space-y-3 rounded-2xl border border-ouro bg-ouro/10 p-4 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={produzirFalta} onChange={(e) => setProduzirFalta(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#455020]" />
            <span>
              <strong>Lançar como produzidos os {faltas.reduce((s, f) => s + f.quantidade, 0)} pacotes que a fábrica não tem no app.</strong> Assim o estoque da fábrica não fica negativo e os insumos são descontados.
            </span>
          </label>
          {produzirFalta && (
            <Selecao rotulo="Embalados para" value={canal} onChange={(e) => setCanal(e.target.value as 'loja' | 'varejo')}>
              <option value="loja">Loja (consignado e compra direta)</option>
              <option value="varejo">Venda varejo</option>
            </Selecao>
          )}
        </div>
      )}

      <AreaDeTexto rotulo="Observação" valor={observacao} aoMudar={setObservacao} dica="Opcional." />
      <Aviso erro={produzir.error ?? movimentar.error} />
      <Botao cheio disabled={!representanteId || total === 0 || movimentar.isPending || produzir.isPending} onClick={enviar}>
        {movimentar.isPending || produzir.isPending ? 'Gravando.' : `Gravar ${retirada ? 'retirada' : 'devolução'} de ${pacotes(total)}`}
      </Botao>
      <Botao variante="secundario" cheio onClick={aoFechar}>
        Cancelar
      </Botao>
    </div>
  )
}
