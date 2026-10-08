import { useState, type FormEvent } from 'react'
import { AreaDeTexto, Aviso, Botao, Campo, Cartao, Carregando, Etiqueta, Rotulo, Selecao, Titulo, Vazio } from '../components/ui'
import {
  useFornecedores,
  useInsumos,
  useProdutos,
  useReceitas,
  useRemoverReceita,
  useSalvarFornecedor,
  useSalvarProduto,
  useSalvarReceita,
} from '../lib/api'
import { NOME_CANAL } from '../lib/formato'
import type { Canal, Fornecedor, Produto } from '../lib/tipos'

const numero = (texto: string) => Number(String(texto).replace(',', '.')) || 0

// ───────────────────────── Fornecedores ─────────────────────────

export function Fornecedores() {
  const fornecedores = useFornecedores()
  const [editando, setEditando] = useState<Fornecedor | 'novo' | null>(null)

  if (fornecedores.isPending) return <Carregando />
  if (fornecedores.error) return <Aviso erro={fornecedores.error} />

  return (
    <div className="space-y-4">
      <Titulo apoio="De quem a Viva Noz compra castanhas, embalagens e adesivos.">Fornecedores</Titulo>

      {editando ? (
        <FormFornecedor fornecedor={editando === 'novo' ? undefined : editando} aoFechar={() => setEditando(null)} />
      ) : (
        <Botao cheio onClick={() => setEditando('novo')}>
          Novo fornecedor
        </Botao>
      )}

      {fornecedores.data.length === 0 && <Vazio>Nenhum fornecedor cadastrado.</Vazio>}

      {fornecedores.data.map((f) => (
        <Cartao key={f.id} className={!f.ativo ? 'opacity-60' : ''}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold">{f.nome}</p>
              <p className="text-xs text-marrom/65">{[f.contato_nome, f.telefone, f.email, f.cidade].filter(Boolean).join(' · ')}</p>
            </div>
            {!f.ativo && <Etiqueta>Inativo</Etiqueta>}
          </div>
          {f.observacoes && <p className="mt-2 text-sm whitespace-pre-line text-marrom/75">{f.observacoes}</p>}
          <Botao variante="discreto" onClick={() => setEditando(f)}>
            Editar
          </Botao>
        </Cartao>
      ))}
    </div>
  )
}

function FormFornecedor({ fornecedor, aoFechar }: { fornecedor?: Fornecedor; aoFechar: () => void }) {
  const salvar = useSalvarFornecedor()
  const [form, setForm] = useState({
    nome: fornecedor?.nome ?? '',
    contato_nome: fornecedor?.contato_nome ?? '',
    telefone: fornecedor?.telefone ?? '',
    email: fornecedor?.email ?? '',
    cidade: fornecedor?.cidade ?? '',
    observacoes: fornecedor?.observacoes ?? '',
  })
  const campo = (nome: keyof typeof form) => ({
    value: form[nome],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [nome]: e.target.value })),
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const texto = (v: string) => v.trim() || null
    await salvar.mutateAsync({
      id: fornecedor?.id,
      nome: form.nome.trim(),
      contato_nome: texto(form.contato_nome),
      telefone: texto(form.telefone),
      email: texto(form.email),
      cidade: texto(form.cidade),
      observacoes: texto(form.observacoes),
    })
    aoFechar()
  }

  return (
    <Cartao>
      <Rotulo>{fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</Rotulo>
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Campo rotulo="Nome" required {...campo('nome')} />
        <Campo rotulo="Pessoa de contato" {...campo('contato_nome')} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="WhatsApp" type="tel" inputMode="tel" {...campo('telefone')} />
          <Campo rotulo="Cidade" {...campo('cidade')} />
        </div>
        <Campo rotulo="E-mail" type="email" {...campo('email')} />
        <AreaDeTexto rotulo="Observações" valor={form.observacoes} aoMudar={(v) => setForm((f) => ({ ...f, observacoes: v }))} dica="Pedido mínimo, prazo, frete, forma de pagamento." />
        <Aviso erro={salvar.error} />
        <Botao type="submit" cheio disabled={salvar.isPending}>
          Salvar
        </Botao>
        {fornecedor && (
          <Botao variante="secundario" cheio disabled={salvar.isPending} onClick={() => salvar.mutateAsync({ id: fornecedor.id, ativo: !fornecedor.ativo }).then(aoFechar)}>
            {fornecedor.ativo ? 'Desativar fornecedor' : 'Reativar fornecedor'}
          </Botao>
        )}
        <Botao variante="discreto" cheio onClick={aoFechar}>
          Cancelar
        </Botao>
      </form>
    </Cartao>
  )
}

// ───────────────────────── Produtos e receitas ─────────────────────────

export function Produtos() {
  const produtos = useProdutos()
  const [editando, setEditando] = useState<Produto | 'novo' | null>(null)

  if (produtos.isPending) return <Carregando />

  return (
    <div className="space-y-4">
      <Titulo apoio="Os pacotes que a Viva Noz vende e do que cada um é feito.">Produtos e receitas</Titulo>

      {editando ? (
        <FormProduto produto={editando === 'novo' ? undefined : editando} proximaOrdem={(produtos.data?.length ?? 0) + 1} aoFechar={() => setEditando(null)} />
      ) : (
        <Botao cheio onClick={() => setEditando('novo')}>
          Novo produto
        </Botao>
      )}

      {produtos.data?.map((p) => (
        <Cartao key={p.id} className={!p.ativo ? 'opacity-70' : ''}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-serif text-2xl leading-tight font-semibold">{p.nome}</p>
              <p className="text-xs text-marrom/65">
                {p.sku} · aparece como "{p.nome_curto}"
              </p>
            </div>
            <Etiqueta tom={p.ativo ? 'verde' : 'neutro'}>{p.ativo ? 'Em linha' : 'Fora de linha'}</Etiqueta>
          </div>
          <Botao variante="discreto" onClick={() => setEditando(p)}>
            Editar produto
          </Botao>
          <Receita produto={p} />
        </Cartao>
      ))}
    </div>
  )
}

function FormProduto({ produto, proximaOrdem, aoFechar }: { produto?: Produto; proximaOrdem: number; aoFechar: () => void }) {
  const salvar = useSalvarProduto()
  const [form, setForm] = useState({ nome: produto?.nome ?? '', nome_curto: produto?.nome_curto ?? '', sku: produto?.sku ?? '' })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      id: produto?.id,
      nome: form.nome.trim(),
      nome_curto: form.nome_curto.trim(),
      sku: form.sku.trim().toUpperCase(),
      ...(produto ? {} : { ordem: proximaOrdem }),
    })
    aoFechar()
  }

  return (
    <Cartao>
      <Rotulo>{produto ? 'Editar produto' : 'Novo produto'}</Rotulo>
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Campo rotulo="Nome completo" required placeholder="Mix de Castanhas" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nome curto" required maxLength={14} placeholder="Mix" value={form.nome_curto} onChange={(e) => setForm({ ...form, nome_curto: e.target.value })} />
          <Campo rotulo="Código" required placeholder="MIX-100" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        {!produto && <p className="text-xs text-marrom/65">Depois de criar, cadastre a receita e os preços (Mais, Tabela de preços).</p>}
        <Aviso erro={salvar.error} />
        <Botao type="submit" cheio disabled={salvar.isPending}>
          Salvar
        </Botao>
        {produto && (
          <>
            <Botao variante="secundario" cheio disabled={salvar.isPending} onClick={() => salvar.mutateAsync({ id: produto.id, ativo: !produto.ativo }).then(aoFechar)}>
              {produto.ativo ? 'Tirar de linha' : 'Voltar para a linha'}
            </Botao>
            <p className="text-xs text-marrom/65">Produto não é apagado, para o histórico de vendas continuar inteiro. Fora de linha, ele some das telas de reposição e produção.</p>
          </>
        )}
        <Botao variante="discreto" cheio onClick={aoFechar}>
          Cancelar
        </Botao>
      </form>
    </Cartao>
  )
}

// O que sai do estoque de insumos a cada pacote produzido.
function Receita({ produto }: { produto: Produto }) {
  const insumos = useInsumos()
  const receitas = useReceitas()
  const salvar = useSalvarReceita()
  const remover = useRemoverReceita()
  const [novo, setNovo] = useState({ insumo_id: '', canal: 'todos' as Canal, quantidade: '' })

  const linhas = (receitas.data ?? [])
    .filter((r) => r.produto_id === produto.id)
    .map((r) => ({ ...r, insumo: insumos.data?.find((i) => i.id === r.insumo_id) }))
    .sort((a, b) => (a.insumo?.ordem ?? 0) - (b.insumo?.ordem ?? 0))
  const gramas = linhas.filter((l) => l.insumo?.unidade === 'g' && l.canal === 'todos').reduce((s, l) => s + Number(l.quantidade), 0)

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({ produto_id: produto.id, insumo_id: novo.insumo_id, canal: novo.canal, quantidade: numero(novo.quantidade) })
    setNovo({ insumo_id: '', canal: 'todos', quantidade: '' })
  }

  return (
    <div className="mt-3 border-t border-linha pt-3">
      <div className="flex items-baseline justify-between">
        <Rotulo>Receita por pacote</Rotulo>
        <p className="text-xs text-marrom/65">{gramas} g de produto</p>
      </div>

      {linhas.length === 0 && <p className="mt-2 text-sm text-marrom/65">Sem receita. A produção deste produto não desconta nenhum insumo.</p>}

      <ul className="mt-2 divide-y divide-linha">
        {linhas.map((l) => (
          <li key={l.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug font-semibold">{l.insumo?.nome ?? '?'}</p>
              {l.canal !== 'todos' && <p className="text-xs text-marrom/65">{NOME_CANAL[l.canal]}</p>}
            </div>
            <input
              aria-label={`Quantidade de ${l.insumo?.nome}`}
              inputMode="decimal"
              defaultValue={String(Number(l.quantidade)).replace('.', ',')}
              onBlur={(e) => {
                const valor = numero(e.target.value)
                if (valor > 0 && valor !== Number(l.quantidade)) salvar.mutate({ id: l.id, quantidade: valor })
              }}
              className="h-11 w-16 rounded-xl border border-marrom/25 bg-white/70 text-center font-bold"
            />
            <span className="w-6 text-xs text-marrom/65">{l.insumo?.unidade}</span>
            <button type="button" aria-label={`Tirar ${l.insumo?.nome} da receita`} onClick={() => remover.mutate(l.id)} className="grid size-11 place-items-center rounded-xl text-xl text-alerta">
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={adicionar} className="mt-2 space-y-2 rounded-xl bg-creme p-3">
        <Selecao rotulo="Acrescentar insumo" required value={novo.insumo_id} onChange={(e) => setNovo({ ...novo, insumo_id: e.target.value })}>
          <option value="">Escolha</option>
          {insumos.data?.filter((i) => i.ativo).map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome} ({i.unidade})
            </option>
          ))}
        </Selecao>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <Selecao rotulo="Quando usa" value={novo.canal} onChange={(e) => setNovo({ ...novo, canal: e.target.value as Canal })}>
            {(['todos', 'loja', 'varejo'] as Canal[]).map((c) => (
              <option key={c} value={c}>
                {NOME_CANAL[c]}
              </option>
            ))}
          </Selecao>
          <Campo rotulo="Quantidade" inputMode="decimal" required pattern="\d+([.,]\d{1,3})?" value={novo.quantidade} onChange={(e) => setNovo({ ...novo, quantidade: e.target.value })} />
        </div>
        <Aviso erro={salvar.error ?? remover.error} />
        <Botao type="submit" variante="secundario" cheio disabled={salvar.isPending}>
          Acrescentar à receita
        </Botao>
      </form>
    </div>
  )
}
