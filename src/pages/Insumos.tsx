import { useState, type FormEvent } from 'react'
import { AreaDeTexto, Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, Etiqueta, Rotulo, Selecao, Titulo, Vazio } from '../components/ui'
import { useCompras, useContarInsumo, useFornecedores, useInsumos, useRegistrarCompra, useSalvarInsumo } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { UNIDADE_DE_COMPRA, daUnidadeBase, data, hoje, paraUnidadeBase, quantidadeInsumo, reais } from '../lib/formato'
import type { Compra, Insumo } from '../lib/tipos'

const numero = (texto: string) => Number(String(texto).replace(',', '.')) || 0

// Custo da última compra de cada insumo, por kg ou por unidade.
function ultimoCusto(compras: Compra[] | undefined, insumo: Insumo) {
  for (const compra of compras ?? []) {
    const item = compra.compra_itens.find((i) => i.insumo_id === insumo.id)
    if (item && Number(item.quantidade) > 0) return Number(item.valor) / daUnidadeBase(item.quantidade, insumo.unidade)
  }
  return null
}

type Modo = 'lista' | 'compra' | 'novo'

// Matérias-primas: quanto tem, quanto deveria ter e o que precisa comprar.
// A produção vê quantidades; valores e compras são só da gestão.
export function Insumos() {
  const { ehGestao } = useAcesso()
  const insumos = useInsumos()
  const compras = useCompras(ehGestao)
  const fornecedores = useFornecedores(ehGestao)
  const [modo, setModo] = useState<Modo>('lista')
  const [aba, setAba] = useState<'estoque' | 'compras'>('estoque')

  if (insumos.isPending) return <Carregando />
  if (insumos.error) return <Aviso erro={insumos.error} />

  if (modo === 'compra') return <NovaCompra aoFechar={() => setModo('lista')} />
  if (modo === 'novo') return <EditarInsumo aoFechar={() => setModo('lista')} />

  const ativos = insumos.data.filter((i) => i.ativo)
  const paraComprar = ativos.filter((i) => i.comprar)
  const semIdeal = ativos.filter((i) => Number(i.estoque_ideal) === 0)
  const nomeFornecedor = (id: string | null) => fornecedores.data?.find((f) => f.id === id)?.nome

  return (
    <div className="space-y-4">
      <Titulo apoio="Castanhas, embalagens e adesivos. A produção desconta daqui pela receita de cada produto.">Matérias-primas</Titulo>

      {paraComprar.length > 0 && (
        <Cartao className="border-alerta/40 bg-alerta/8">
          <p className="font-semibold">
            {paraComprar.length === 1 ? 'Um insumo está' : `${paraComprar.length} insumos estão`} abaixo do estoque mínimo.
          </p>
          <ul className="mt-2 space-y-0.5 text-sm">
            {paraComprar.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span>{i.nome}</span>
                <span className="font-semibold whitespace-nowrap">comprar {quantidadeInsumo(i.falta_para_o_ideal, i.unidade)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {semIdeal.length > 0 && ehGestao && (
        <p className="rounded-xl border border-ouro bg-ouro/10 px-4 py-3 text-sm">
          {semIdeal.length === 1 ? 'Um insumo está' : `${semIdeal.length} insumos estão`} sem estoque ideal definido. Sem isso o app não avisa quando comprar.
        </p>
      )}

      {ehGestao && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Botao onClick={() => setModo('compra')}>Registrar compra</Botao>
            <Botao variante="secundario" onClick={() => setModo('novo')}>
              Novo insumo
            </Botao>
          </div>
          <div className="flex rounded-xl border border-linha bg-papel p-1">
            {(['estoque', 'compras'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAba(a)}
                className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${aba === a ? 'bg-verde text-creme' : 'text-marrom/70'}`}
              >
                {a === 'estoque' ? 'Estoque' : 'Compras feitas'}
              </button>
            ))}
          </div>
        </>
      )}

      {aba === 'estoque' &&
        insumos.data.map((i) => (
          <CartaoInsumo key={i.id} insumo={i} custo={ehGestao ? ultimoCusto(compras.data, i) : null} fornecedor={nomeFornecedor(i.fornecedor_id)} />
        ))}

      {aba === 'compras' && (
        <>
          {compras.data?.length === 0 && <Vazio>Nenhuma compra registrada.</Vazio>}
          {compras.data?.map((c) => (
            <Cartao key={c.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{nomeFornecedor(c.fornecedor_id) ?? 'Sem fornecedor'}</p>
                  <p className="text-xs text-marrom/65">{data(c.comprada_em)}</p>
                </div>
                <p className="text-xl font-bold">{reais(c.valor_total)}</p>
              </div>
              <ul className="mt-3 space-y-0.5 text-sm text-marrom/80">
                {c.compra_itens.map((item) => {
                  const insumo = insumos.data.find((i) => i.id === item.insumo_id)
                  return (
                    <li key={item.insumo_id} className="flex justify-between gap-3">
                      <span>
                        {insumo?.nome ?? '?'} · {insumo ? quantidadeInsumo(item.quantidade, insumo.unidade) : item.quantidade}
                      </span>
                      <span>{reais(item.valor)}</span>
                    </li>
                  )
                })}
                {Number(c.valor_frete) > 0 && (
                  <li className="flex justify-between gap-3">
                    <span>Frete</span>
                    <span>{reais(c.valor_frete)}</span>
                  </li>
                )}
              </ul>
              {c.observacoes && <p className="mt-2 text-sm text-marrom/75">{c.observacoes}</p>}
            </Cartao>
          ))}
        </>
      )}

      {ehGestao && (
        <div className="grid grid-cols-2 gap-3">
          <BotaoLink para="/mais/fornecedores" variante="secundario">
            Fornecedores
          </BotaoLink>
          <BotaoLink para="/mais/produtos" variante="secundario">
            Produtos e receitas
          </BotaoLink>
        </div>
      )}
    </div>
  )
}

function CartaoInsumo({ insumo, custo, fornecedor }: { insumo: Insumo; custo: number | null; fornecedor?: string }) {
  const { ehGestao } = useAcesso()
  const contar = useContarInsumo()
  const [modo, setModo] = useState<'ver' | 'contar' | 'editar'>('ver')
  const [operacaoId, setOperacaoId] = useState(() => crypto.randomUUID())
  const [contado, setContado] = useState('')
  const un = UNIDADE_DE_COMPRA[insumo.unidade]
  const negativo = Number(insumo.saldo) < 0

  async function gravarContagem(e: FormEvent) {
    e.preventDefault()
    await contar.mutateAsync({ operacaoId, insumoId: insumo.id, quantidade: paraUnidadeBase(numero(contado), insumo.unidade), motivo: '' })
    setOperacaoId(crypto.randomUUID())
    setContado('')
    setModo('ver')
  }

  if (modo === 'editar') return <EditarInsumo insumo={insumo} aoFechar={() => setModo('ver')} />

  return (
    <Cartao className={!insumo.ativo ? 'opacity-60' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="leading-snug font-bold">{insumo.nome}</p>
          <p className="mt-0.5 text-xs text-marrom/65">
            {Number(insumo.estoque_ideal) > 0
              ? `ideal ${quantidadeInsumo(insumo.estoque_ideal, insumo.unidade)} · mínimo ${quantidadeInsumo(insumo.estoque_minimo, insumo.unidade)}`
              : 'sem estoque ideal definido'}
          </p>
          {(fornecedor || custo !== null) && (
            <p className="text-xs text-marrom/65">
              {[fornecedor, custo !== null && `última compra a ${reais(custo)} por ${un}`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xl font-bold ${negativo ? 'text-alerta' : ''}`}>{quantidadeInsumo(insumo.saldo, insumo.unidade)}</p>
          {!insumo.ativo ? (
            <Etiqueta>Fora de uso</Etiqueta>
          ) : negativo ? (
            <Etiqueta tom="alerta">Negativo</Etiqueta>
          ) : insumo.comprar ? (
            <Etiqueta tom="alerta">Comprar</Etiqueta>
          ) : (
            Number(insumo.estoque_ideal) > 0 && <Etiqueta tom="verde">Em dia</Etiqueta>
          )}
        </div>
      </div>

      {negativo && <p className="mt-2 text-xs text-alerta">Saiu mais na produção do que entrou no app. Conte o estoque ou registre a compra que falta.</p>}

      {modo === 'ver' && (
        <div className="mt-1 flex gap-5">
          <Botao variante="discreto" onClick={() => setModo('contar')}>
            Contar estoque
          </Botao>
          {ehGestao && (
            <Botao variante="discreto" onClick={() => setModo('editar')}>
              Editar
            </Botao>
          )}
        </div>
      )}

      {modo === 'contar' && (
        <form onSubmit={gravarContagem} className="mt-3 space-y-3 border-t border-linha pt-3">
          <Campo rotulo={`Quanto tem agora, em ${un}`} inputMode="decimal" required pattern="\d+([.,]\d{1,3})?" placeholder={insumo.unidade === 'g' ? '2,5' : '300'} value={contado} onChange={(e) => setContado(e.target.value)} />
          <p className="text-xs text-marrom/65">O app lança a diferença entre a contagem e o saldo atual. O histórico fica guardado.</p>
          <Aviso erro={contar.error} />
          <div className="grid grid-cols-2 gap-2">
            <Botao type="submit" disabled={contar.isPending}>
              Gravar contagem
            </Botao>
            <Botao variante="secundario" onClick={() => setModo('ver')}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Cartao>
  )
}

function EditarInsumo({ insumo, aoFechar }: { insumo?: Insumo; aoFechar: () => void }) {
  const fornecedores = useFornecedores()
  const salvar = useSalvarInsumo()
  const [form, setForm] = useState({
    nome: insumo?.nome ?? '',
    unidade: insumo?.unidade ?? ('g' as 'g' | 'un'),
    ideal: insumo ? String(daUnidadeBase(insumo.estoque_ideal, insumo.unidade)).replace('.', ',') : '',
    fornecedor_id: insumo?.fornecedor_id ?? '',
  })
  const un = UNIDADE_DE_COMPRA[form.unidade]
  const ideal = numero(form.ideal)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      id: insumo?.id,
      nome: form.nome.trim(),
      // A unidade não muda depois de criado: o histórico está nela.
      ...(insumo ? {} : { unidade: form.unidade }),
      estoque_ideal: paraUnidadeBase(ideal, form.unidade),
      fornecedor_id: form.fornecedor_id || null,
    })
    aoFechar()
  }

  return (
    <Cartao>
      <Rotulo>{insumo ? 'Editar insumo' : 'Novo insumo'}</Rotulo>
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Campo rotulo="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        {!insumo && (
          <Selecao rotulo="Como é medido" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value as 'g' | 'un' })}>
            <option value="g">Por peso (kg)</option>
            <option value="un">Por unidade</option>
          </Selecao>
        )}
        <Campo rotulo={`Estoque ideal, em ${un}`} inputMode="decimal" pattern="\d*([.,]\d{1,3})?" placeholder={form.unidade === 'g' ? '10' : '1000'} value={form.ideal} onChange={(e) => setForm({ ...form, ideal: e.target.value })} />
        <p className="-mt-1 text-xs text-marrom/65">
          {ideal > 0
            ? `O app avisa para comprar quando chegar a ${(ideal * 0.3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${un} (30% do ideal).`
            : 'Com o estoque ideal definido, o app avisa quando o saldo chegar a 30% dele.'}
        </p>
        <Selecao rotulo="Fornecedor habitual" value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}>
          <option value="">Nenhum</option>
          {fornecedores.data?.filter((f) => f.ativo || f.id === form.fornecedor_id).map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Selecao>
        <Aviso erro={salvar.error} />
        <Botao type="submit" cheio disabled={salvar.isPending}>
          Salvar
        </Botao>
        {insumo && (
          <Botao variante="secundario" cheio disabled={salvar.isPending} onClick={() => salvar.mutateAsync({ id: insumo.id, ativo: !insumo.ativo }).then(aoFechar)}>
            {insumo.ativo ? 'Tirar de uso' : 'Voltar a usar'}
          </Botao>
        )}
        <Botao variante="discreto" cheio onClick={aoFechar}>
          Cancelar
        </Botao>
      </form>
    </Cartao>
  )
}

function NovaCompra({ aoFechar }: { aoFechar: () => void }) {
  const insumos = useInsumos()
  const fornecedores = useFornecedores()
  const registrar = useRegistrarCompra()
  // Criado uma vez por compra: reenviar não duplica.
  const [compraId] = useState(() => crypto.randomUUID())
  const [fornecedorId, setFornecedorId] = useState('')
  const [compradaEm, setCompradaEm] = useState(hoje())
  const [linhas, setLinhas] = useState<Record<string, { quantidade: string; valor: string }>>({})
  const [frete, setFrete] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const ativos = (insumos.data ?? []).filter((i) => i.ativo)
  const itens = ativos
    .map((i) => ({ insumo: i, quantidade: numero(linhas[i.id]?.quantidade ?? ''), valor: numero(linhas[i.id]?.valor ?? '') }))
    .filter((x) => x.quantidade > 0)
  const total = itens.reduce((s, x) => s + x.valor, 0) + numero(frete)
  const mudar = (id: string, campo: 'quantidade' | 'valor', texto: string) =>
    setLinhas((l) => ({ ...l, [id]: { ...(l[id] ?? { quantidade: '', valor: '' }), [campo]: texto } }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await registrar.mutateAsync({
      id: compraId,
      fornecedorId: fornecedorId || null,
      itens: itens.map((x) => ({ insumo_id: x.insumo.id, quantidade: paraUnidadeBase(x.quantidade, x.insumo.unidade), valor: x.valor })),
      compradaEm,
      frete: numero(frete),
      observacoes,
    })
    aoFechar()
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Titulo apoio="Preencha só os insumos que vieram nesta compra.">Compra de insumos</Titulo>

      <Selecao rotulo="Fornecedor" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
        <option value="">Sem fornecedor cadastrado</option>
        {fornecedores.data?.filter((f) => f.ativo).map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
      </Selecao>
      <Campo rotulo="Data da compra" type="date" max={hoje()} required value={compradaEm} onChange={(e) => setCompradaEm(e.target.value)} />

      {ativos.map((i) => (
        <Cartao key={i.id} className="py-3">
          <p className="text-sm font-bold">{i.nome}</p>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <Campo rotulo={`Quantidade (${UNIDADE_DE_COMPRA[i.unidade]})`} inputMode="decimal" pattern="\d*([.,]\d{1,3})?" value={linhas[i.id]?.quantidade ?? ''} onChange={(e) => mudar(i.id, 'quantidade', e.target.value)} />
            <Campo rotulo="Valor pago (R$)" inputMode="decimal" pattern="\d*([.,]\d{1,2})?" value={linhas[i.id]?.valor ?? ''} onChange={(e) => mudar(i.id, 'valor', e.target.value)} />
          </div>
        </Cartao>
      ))}

      <Campo rotulo="Frete (R$)" inputMode="decimal" pattern="\d*([.,]\d{1,2})?" placeholder="Se já está no valor dos itens, deixe vazio." value={frete} onChange={(e) => setFrete(e.target.value)} />
      <AreaDeTexto rotulo="Observações" valor={observacoes} aoMudar={setObservacoes} dica="Opcional. Número do pedido, prazo, condição." />

      <Aviso erro={registrar.error} />
      <div className="sticky bottom-[72px] rounded-2xl border border-linha bg-profundo p-4 text-creme shadow-lg">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-creme/70">
              {itens.length} {itens.length === 1 ? 'insumo' : 'insumos'} nesta compra
            </p>
            <p className="text-3xl font-bold">{reais(total)}</p>
          </div>
          <button type="submit" disabled={itens.length === 0 || registrar.isPending} className="min-h-12 rounded-xl bg-creme px-5 text-[15px] font-bold text-profundo disabled:opacity-40">
            {registrar.isPending ? 'Gravando.' : 'Gravar compra'}
          </button>
        </div>
      </div>
      <Botao variante="secundario" cheio onClick={aoFechar}>
        Cancelar
      </Botao>
    </form>
  )
}
