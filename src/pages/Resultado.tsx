import { useState, type FormEvent, type ReactNode } from 'react'
import { Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, Etiqueta, Rotulo, Selecao, Vazio } from '../components/ui'
import { useFinanceiro, useLancamentos, useProdutos, useSalvarLancamento, type MesFinanceiro } from '../lib/api'
import { data, hoje, reais } from '../lib/formato'
import type { Lancamento, LancamentoTipo } from '../lib/tipos'

const numero = (texto: string) => Number(String(texto).replace(',', '.')) || 0
const soma = (valores: number[]) => valores.reduce((s, v) => s + Number(v), 0)
const nomeDoMes = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/').replace('.', '')
const porcento = (parte: number, todo: number) => (todo > 0 ? `${((parte / todo) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '')

const CATEGORIAS: Record<LancamentoTipo, string[]> = {
  despesa: ['Transporte e combustível', 'Materiais e embalagens avulsas', 'Marketing e brindes', 'Taxas e tarifas', 'Contador e serviços', 'Equipamentos', 'Pró-labore', 'Outras despesas'],
  imposto: ['Impostos sobre vendas'],
  aporte: ['Saldo inicial de caixa', 'Aporte dos sócios', 'Empréstimo recebido'],
  retirada: ['Retirada dos sócios', 'Pagamento de empréstimo'],
}
const NOME_TIPO: Record<LancamentoTipo, string> = { despesa: 'Despesa', imposto: 'Imposto', aporte: 'Entrada de dinheiro', retirada: 'Saída de dinheiro' }

type Aba = 'dre' | 'caixa' | 'lancamentos'

// Visão financeira da gestão. DRE no regime de competência (quando a venda
// e o gasto aconteceram); fluxo de caixa no regime de caixa (quando o
// dinheiro entrou e saiu).
export function Resultado() {
  const [aba, setAba] = useState<Aba>('dre')
  const [meses, setMeses] = useState(6)
  const financeiro = useFinanceiro(meses)

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl border border-linha bg-papel p-1">
        {(
          [
            ['dre', 'DRE'],
            ['caixa', 'Fluxo de caixa'],
            ['lancamentos', 'Lançamentos'],
          ] as [Aba, string][]
        ).map(([id, nome]) => (
          <button key={id} type="button" onClick={() => setAba(id)} className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${aba === id ? 'bg-verde text-creme' : 'text-marrom/70'}`}>
            {nome}
          </button>
        ))}
      </div>

      {aba !== 'lancamentos' && (
        <Selecao rotulo="Período" value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
        </Selecao>
      )}

      {aba === 'lancamentos' ? (
        <Lancamentos />
      ) : financeiro.isPending ? (
        <Carregando />
      ) : financeiro.error ? (
        <Aviso erro={financeiro.error} />
      ) : aba === 'dre' ? (
        <Dre dados={financeiro.data} />
      ) : (
        <Caixa dados={financeiro.data} />
      )}
    </div>
  )
}

// ───────────────────────── Tabela mês a mês ─────────────────────────

interface Linha {
  nome: string
  valores: number[]
  // total: destaque; sub: detalhe de uma linha; menos: valor que reduz o resultado.
  estilo?: 'total' | 'sub' | 'menos'
  semTotal?: boolean
  nota?: (valor: number, coluna: number) => string
}

function Tabela({ meses, linhas, comTotal = true }: { meses: MesFinanceiro[]; linhas: Linha[]; comTotal?: boolean }) {
  const celula = 'px-3 py-2 text-right whitespace-nowrap'
  // No celular cabe pouco: o mês corrente vem primeiro e os anteriores ficam à direita.
  const ordem = meses.map((_, i) => i).reverse()
  return (
    <div className="overflow-x-auto rounded-2xl border border-linha bg-papel">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-marrom/60 uppercase">
            <th className="sticky left-0 bg-papel px-3 py-2 text-left font-semibold"> </th>
            {ordem.map((i) => (
              <th key={meses[i].mes} className={`${celula} font-semibold`}>
                {nomeDoMes(meses[i].mes)}
              </th>
            ))}
            {comTotal && <th className={`${celula} font-semibold`}>Total</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const total = soma(l.valores)
            const forte = l.estilo === 'total'
            const mostra = (v: number) => (l.estilo === 'menos' || l.estilo === 'sub' ? (v === 0 ? '–' : reais(v)) : reais(v))
            return (
              <tr key={l.nome} className={`border-t border-linha ${forte ? 'bg-creme font-bold' : ''}`}>
                <td className={`sticky left-0 px-3 py-2 ${forte ? 'bg-creme' : 'bg-papel'} ${l.estilo === 'sub' ? 'pl-6 text-marrom/70' : ''}`}>{l.nome}</td>
                {ordem.map((i) => [l.valores[i], i] as const).map(([v, i]) => (
                  <td key={i} className={`${celula} ${v < 0 ? 'text-alerta' : ''} ${l.estilo === 'sub' ? 'text-marrom/70' : ''}`}>
                    {mostra(v)}
                    {l.nota && <span className="block text-[11px] font-normal text-marrom/60">{l.nota(v, i)}</span>}
                  </td>
                ))}
                {comTotal && <td className={`${celula} ${total < 0 ? 'text-alerta' : ''}`}>{l.semTotal ? '' : mostra(total)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Indicador({ rotulo, valor, apoio }: { rotulo: string; valor: ReactNode; apoio?: string }) {
  return (
    <Cartao>
      <Rotulo>{rotulo}</Rotulo>
      <p className="mt-2 text-2xl font-bold">{valor}</p>
      {apoio && <p className="text-xs text-marrom/65">{apoio}</p>}
    </Cartao>
  )
}

// ───────────────────────── DRE ─────────────────────────

function Dre({ dados }: { dados: NonNullable<ReturnType<typeof useFinanceiro>['data']> }) {
  const produtos = useProdutos()
  const meses = dados.meses
  const col = (f: (m: MesFinanceiro) => number) => meses.map((m) => Number(f(m)))

  const receita = col((m) => Number(m.receita_lojas) + Number(m.receita_direta) + Number(m.receita_varejo))
  const impostos = col((m) => m.impostos)
  const liquida = receita.map((v, i) => v - impostos[i])
  const cmv = col((m) => m.cmv)
  const bruto = liquida.map((v, i) => v - cmv[i])
  const comissoes = col((m) => m.comissoes)
  const amostras = col((m) => m.amostras)
  const perdas = col((m) => m.perdas)
  const categorias = [...new Set(meses.flatMap((m) => Object.keys(m.despesas)))].sort()
  const despesas = categorias.map((c) => ({ nome: c, valores: col((m) => m.despesas[c] ?? 0) }))
  const totalDespesas = meses.map((_, i) => soma(despesas.map((d) => d.valores[i])))
  const resultado = bruto.map((v, i) => v - comissoes[i] - amostras[i] - perdas[i] - totalDespesas[i])

  const atual = meses.length - 1
  const semCusto = dados.custos.filter((c) => Number(c.insumos_sem_custo) > 0 || Number(c.custo_loja) === 0)

  const linhas: Linha[] = [
    { nome: 'Receita bruta', valores: receita, estilo: 'total' },
    { nome: 'Lojas em consignação', valores: col((m) => m.receita_lojas), estilo: 'sub' },
    { nome: 'Compra direta', valores: col((m) => m.receita_direta), estilo: 'sub' },
    { nome: 'Venda varejo', valores: col((m) => m.receita_varejo), estilo: 'sub' },
    { nome: '(−) Impostos sobre vendas', valores: impostos, estilo: 'menos' },
    { nome: 'Receita líquida', valores: liquida, estilo: 'total' },
    { nome: '(−) Custo dos pacotes vendidos', valores: cmv, estilo: 'menos' },
    { nome: 'Lucro bruto', valores: bruto, estilo: 'total', nota: (v, i) => porcento(v, liquida[i]) },
    { nome: '(−) Comissões e bônus', valores: comissoes, estilo: 'menos' },
    { nome: '(−) Amostras entregues', valores: amostras, estilo: 'menos' },
    { nome: '(−) Perdas e vencidos', valores: perdas, estilo: 'menos' },
    ...despesas.map((d) => ({ nome: `(−) ${d.nome}`, valores: d.valores, estilo: 'menos' as const })),
    { nome: 'Resultado', valores: resultado, estilo: 'total', nota: (v, i) => porcento(v, liquida[i]) },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Indicador rotulo="Receita do mês" valor={reais(receita[atual])} apoio={`${Number(meses[atual].pacotes)} pacotes vendidos`} />
        <Indicador
          rotulo="Resultado do mês"
          valor={<span className={resultado[atual] < 0 ? 'text-alerta' : ''}>{reais(resultado[atual])}</span>}
          apoio={liquida[atual] > 0 ? `${porcento(resultado[atual], liquida[atual])} da receita líquida` : 'sem venda no mês'}
        />
      </div>

      {semCusto.length > 0 && (
        <p className="rounded-xl border border-ouro bg-ouro/10 px-4 py-3 text-sm">
          O custo dos pacotes está incompleto: falta compra registrada de algum insumo de{' '}
          {semCusto.map((c) => produtos.data?.find((p) => p.id === c.produto_id)?.nome_curto ?? '?').join(', ')}. Enquanto isso o lucro aparece maior do que é.
        </p>
      )}

      <Tabela meses={meses} linhas={linhas} />

      <Cartao>
        <Rotulo>Custo de um pacote hoje</Rotulo>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-marrom/60 uppercase">
              <th className="pb-1 font-semibold">Produto</th>
              <th className="pb-1 text-right font-semibold">Para loja</th>
              <th className="pb-1 text-right font-semibold">Para varejo</th>
            </tr>
          </thead>
          <tbody>
            {dados.custos.map((c) => (
              <tr key={c.produto_id} className="border-t border-linha">
                <td className="py-1.5">{produtos.data?.find((p) => p.id === c.produto_id)?.nome_curto ?? '?'}</td>
                <td className="py-1.5 text-right font-semibold">{reais(c.custo_loja)}</td>
                <td className="py-1.5 text-right font-semibold">{reais(c.custo_varejo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-marrom/65">Receita de cada produto vezes o custo médio de todas as compras de cada insumo, com o frete rateado.</p>
      </Cartao>

      <Cartao>
        <Rotulo>Como ler</Rotulo>
        <ul className="mt-2 space-y-1.5 text-sm text-marrom/80">
          <li>A venda conta no mês em que aconteceu (dia da visita ou da venda na rua), mesmo que a loja ainda não tenha pago.</li>
          <li>A comissão conta no mês em que o Pix da loja foi confirmado.</li>
          <li>Amostras e perdas entram pelo custo do pacote.</li>
          <li>Impostos e despesas vêm do que for lançado na aba Lançamentos.</li>
        </ul>
      </Cartao>
    </div>
  )
}

// ───────────────────────── Fluxo de caixa ─────────────────────────

function Caixa({ dados }: { dados: NonNullable<ReturnType<typeof useFinanceiro>['data']> }) {
  const meses = dados.meses
  const col = (f: (m: MesFinanceiro) => number) => meses.map((m) => Number(f(m)))

  const entradas = col((m) => Number(m.cx_lojas) + Number(m.cx_varejo) + Number(m.cx_aportes))
  const saidas = col((m) => Number(m.cx_compras) + Number(m.cx_repasses) + Number(m.cx_despesas) + Number(m.cx_impostos) + Number(m.cx_retiradas))
  const geracao = entradas.map((v, i) => v - saidas[i])
  const finais: number[] = []
  geracao.reduce((saldo, g) => {
    finais.push(saldo + g)
    return saldo + g
  }, Number(dados.saldo_anterior))
  const iniciais = [Number(dados.saldo_anterior), ...finais.slice(0, -1)]
  const atual = meses.length - 1
  const aPagar = Number(dados.a_pagar_comissoes) + Number(dados.a_pagar_despesas)

  const linhas: Linha[] = [
    { nome: 'Saldo no início do mês', valores: iniciais, estilo: 'total', semTotal: true },
    { nome: 'Entradas', valores: entradas, estilo: 'total' },
    { nome: 'Recebido das lojas', valores: col((m) => m.cx_lojas), estilo: 'sub' },
    { nome: 'Recebido do varejo', valores: col((m) => m.cx_varejo), estilo: 'sub' },
    { nome: 'Aportes e saldo inicial', valores: col((m) => m.cx_aportes), estilo: 'sub' },
    { nome: 'Saídas', valores: saidas, estilo: 'total' },
    { nome: 'Compra de insumos', valores: col((m) => m.cx_compras), estilo: 'sub' },
    { nome: 'Comissões pagas', valores: col((m) => m.cx_repasses), estilo: 'sub' },
    { nome: 'Despesas pagas', valores: col((m) => m.cx_despesas), estilo: 'sub' },
    { nome: 'Impostos pagos', valores: col((m) => m.cx_impostos), estilo: 'sub' },
    { nome: 'Retiradas', valores: col((m) => m.cx_retiradas), estilo: 'sub' },
    { nome: 'Sobra ou falta do mês', valores: geracao, estilo: 'total' },
    { nome: 'Saldo no fim do mês', valores: finais, estilo: 'total', semTotal: true },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Indicador
          rotulo="Saldo em caixa"
          valor={<span className={finais[atual] < 0 ? 'text-alerta' : ''}>{reais(finais[atual])}</span>}
          apoio="pelo que está lançado no app"
        />
        <Indicador rotulo="Sobra do mês" valor={<span className={geracao[atual] < 0 ? 'text-alerta' : ''}>{reais(geracao[atual])}</span>} apoio="entradas menos saídas" />
        <Indicador rotulo="Ainda a receber" valor={reais(dados.a_receber)} apoio="lojas e varejo sem confirmação" />
        <Indicador rotulo="Ainda a pagar" valor={reais(aPagar)} apoio="comissões e despesas não pagas" />
      </div>

      <Cartao className="border-ouro bg-ouro/10">
        <Rotulo>Saldo previsto</Rotulo>
        <p className="mt-1 text-2xl font-bold">{reais(finais[atual] + Number(dados.a_receber) - aPagar)}</p>
        <p className="text-xs text-marrom/70">Saldo de hoje, mais o que falta receber, menos o que falta pagar.</p>
      </Cartao>

      {Number(dados.saldo_anterior) === 0 && finais[atual] < 0 && (
        <p className="rounded-xl border border-ouro bg-ouro/10 px-4 py-3 text-sm">
          O saldo está negativo porque o app não sabe quanto havia em caixa no começo. Lance o "Saldo inicial de caixa" na aba Lançamentos.
        </p>
      )}

      <Tabela meses={meses} linhas={linhas} />

      <Cartao>
        <Rotulo>Como ler</Rotulo>
        <ul className="mt-2 space-y-1.5 text-sm text-marrom/80">
          <li>Aqui só entra dinheiro que já mudou de mão: Pix confirmado, compra feita, comissão paga, despesa paga.</li>
          <li>A compra de insumos conta no dia da compra.</li>
          <li>Venda ainda não paga fica em "Ainda a receber", fora do saldo.</li>
        </ul>
      </Cartao>
    </div>
  )
}

// ───────────────────────── Lançamentos ─────────────────────────

function Lancamentos() {
  const lancamentos = useLancamentos()
  const salvar = useSalvarLancamento()
  const [criando, setCriando] = useState(false)

  if (lancamentos.isPending) return <Carregando />

  return (
    <div className="space-y-3">
      <p className="text-sm text-marrom/75">
        O que não nasce de uma operação do app: despesas, impostos, aportes e retiradas. Vendas, comissões e compras de insumos já entram sozinhas.
      </p>

      {criando ? (
        <NovoLancamento aoFechar={() => setCriando(false)} />
      ) : (
        <Botao cheio onClick={() => setCriando(true)}>
          Novo lançamento
        </Botao>
      )}
      <BotaoLink para="/mais/insumos" variante="discreto" cheio>
        Compra de insumos se registra em Matérias-primas
      </BotaoLink>

      <Aviso erro={salvar.error} />
      {lancamentos.data?.length === 0 && <Vazio>Nenhum lançamento.</Vazio>}
      {lancamentos.data?.map((l) => (
        <CartaoLancamento key={l.id} lancamento={l} />
      ))}
    </div>
  )
}

function CartaoLancamento({ lancamento: l }: { lancamento: Lancamento }) {
  const salvar = useSalvarLancamento()
  const cancelado = Boolean(l.cancelado_em)
  const entrada = l.tipo === 'aporte'
  return (
    <Cartao className={cancelado ? 'opacity-55' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="leading-snug font-bold">{l.categoria}</p>
          <p className="text-xs text-marrom/65">{[NOME_TIPO[l.tipo], l.descricao, `competência ${data(l.competencia)}`].filter(Boolean).join(' · ')}</p>
        </div>
        <p className={`text-lg font-bold whitespace-nowrap ${entrada ? 'text-verde' : ''}`}>
          {entrada ? '+' : '−'} {reais(l.valor)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {cancelado ? <Etiqueta tom="alerta">Cancelado</Etiqueta> : l.pago_em ? <Etiqueta tom="verde">Pago em {data(l.pago_em)}</Etiqueta> : <Etiqueta tom="ouro">Ainda não pago</Etiqueta>}
        {!cancelado && !l.pago_em && (
          <Botao variante="discreto" disabled={salvar.isPending} onClick={() => salvar.mutate({ id: l.id, pago_em: hoje() })}>
            Marcar pago hoje
          </Botao>
        )}
        {!cancelado && (
          <Botao
            variante="discreto"
            disabled={salvar.isPending}
            onClick={() => window.confirm('Cancelar este lançamento? Ele sai do DRE e do caixa, mas fica no histórico.') && salvar.mutate({ id: l.id, cancelado_em: new Date().toISOString() })}
          >
            Cancelar
          </Botao>
        )}
      </div>
    </Cartao>
  )
}

function NovoLancamento({ aoFechar }: { aoFechar: () => void }) {
  const salvar = useSalvarLancamento()
  const [form, setForm] = useState({ tipo: 'despesa' as LancamentoTipo, categoria: CATEGORIAS.despesa[0], descricao: '', valor: '', competencia: hoje(), pago: true, pago_em: hoje() })
  const soCaixa = form.tipo === 'aporte' || form.tipo === 'retirada'

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      tipo: form.tipo,
      categoria: form.categoria,
      descricao: form.descricao.trim() || null,
      valor: numero(form.valor),
      competencia: soCaixa ? form.pago_em : form.competencia,
      pago_em: soCaixa || form.pago ? form.pago_em : null,
    })
    aoFechar()
  }

  return (
    <Cartao>
      <Rotulo>Novo lançamento</Rotulo>
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Selecao rotulo="O que é" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as LancamentoTipo, categoria: CATEGORIAS[e.target.value as LancamentoTipo][0] })}>
          {(Object.keys(NOME_TIPO) as LancamentoTipo[]).map((t) => (
            <option key={t} value={t}>
              {NOME_TIPO[t]}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
          {CATEGORIAS[form.tipo].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Descrição" placeholder="Opcional." value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        <Campo rotulo="Valor (R$)" inputMode="decimal" required pattern="\d+([.,]\d{1,2})?" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />

        {soCaixa ? (
          <Campo rotulo="Dia em que o dinheiro entrou ou saiu" type="date" required max={hoje()} value={form.pago_em} onChange={(e) => setForm({ ...form, pago_em: e.target.value })} />
        ) : (
          <>
            <Campo rotulo="Mês a que se refere (qualquer dia do mês)" type="date" required value={form.competencia} onChange={(e) => setForm({ ...form, competencia: e.target.value })} />
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" checked={form.pago} onChange={(e) => setForm({ ...form, pago: e.target.checked })} className="size-5 accent-[#455020]" />
              Já foi pago
            </label>
            {form.pago && <Campo rotulo="Dia do pagamento" type="date" required max={hoje()} value={form.pago_em} onChange={(e) => setForm({ ...form, pago_em: e.target.value })} />}
          </>
        )}

        <p className="text-xs text-marrom/65">
          {soCaixa ? 'Entra só no fluxo de caixa, não no DRE.' : 'Entra no DRE pelo mês a que se refere e no caixa pelo dia do pagamento.'}
        </p>
        <Aviso erro={salvar.error} />
        <Botao type="submit" cheio disabled={salvar.isPending}>
          Salvar
        </Botao>
        <Botao variante="discreto" cheio onClick={aoFechar}>
          Cancelar
        </Botao>
      </form>
    </Cartao>
  )
}
