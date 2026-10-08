import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CampoSegmento } from '../components/Segmento'
import { AreaDeTexto, Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, Contador, Etiqueta, Rotulo, Selecao, Titulo, Vazio } from '../components/ui'
import { useAmostras, useProdutos, useProspectos, useRegistrarAmostra, useRepresentantes, useSalvarProspecto } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { useEstoqueDeQuemVende } from '../lib/estoque'
import { NOME_PROSPECTO, data, hoje, pacotes } from '../lib/formato'
import type { Prospecto, ProspectoStatus } from '../lib/tipos'

const TOM: Record<ProspectoStatus, 'neutro' | 'ouro' | 'verde' | 'alerta'> = {
  novo: 'neutro',
  em_conversa: 'ouro',
  virou_loja: 'verde',
  descartado: 'alerta',
}

// Pontos de venda que ainda não são loja. É para eles que vão as amostras.
export function Potenciais() {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const prospectos = useProspectos()
  const amostras = useAmostras()
  const representantes = useRepresentantes()
  const [abertos, setAbertos] = useState(true)

  if (prospectos.isPending) return <Carregando />
  if (prospectos.error) return <Aviso erro={prospectos.error} />

  const lista = prospectos.data.filter((p) => (abertos ? p.status === 'novo' || p.status === 'em_conversa' : p.status === 'virou_loja' || p.status === 'descartado'))
  const amostrasDe = (id: string) =>
    (amostras.data ?? []).filter((a) => a.prospecto_id === id).reduce((s, a) => s + a.amostra_itens.reduce((t, i) => t + i.quantidade, 0), 0)

  return (
    <div className="space-y-4">
      <Titulo apoio="Quem ainda não é loja. Registre aqui as amostras entregues.">Potenciais clientes</Titulo>

      <div className="flex rounded-xl border border-linha bg-papel p-1">
        <Link to="/lojas" className="grid min-h-10 flex-1 place-items-center rounded-lg text-sm font-semibold text-marrom/70">
          Lojas
        </Link>
        <span className="grid min-h-10 flex-1 place-items-center rounded-lg bg-verde text-sm font-semibold text-creme">Potenciais</span>
      </div>

      {(ehGestao || meuRepresentanteId) && (
        <BotaoLink para="/potenciais/novo" cheio>
          Cadastrar potencial cliente
        </BotaoLink>
      )}

      <div className="flex gap-4 text-sm font-semibold">
        <button type="button" onClick={() => setAbertos(true)} className={abertos ? 'text-verde underline underline-offset-4' : 'text-marrom/60'}>
          Em aberto
        </button>
        <button type="button" onClick={() => setAbertos(false)} className={!abertos ? 'text-verde underline underline-offset-4' : 'text-marrom/60'}>
          Encerrados
        </button>
      </div>

      {lista.length === 0 && <Vazio>{abertos ? 'Nenhum potencial cliente em aberto.' : 'Nenhum encerrado.'}</Vazio>}

      <ul className="space-y-2.5">
        {lista.map((p) => (
          <li key={p.id}>
            <Link to={`/potenciais/${p.id}`} className="block rounded-2xl border border-linha bg-papel p-4 active:bg-areia/25">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[16px] leading-snug font-bold">{p.nome}</p>
                <Etiqueta tom={TOM[p.status]}>{NOME_PROSPECTO[p.status]}</Etiqueta>
              </div>
              <p className="mt-0.5 text-xs text-marrom/65">
                {[p.bairro, p.segmento, ehGestao && representantes.data?.find((r) => r.id === p.representante_id)?.nome].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-1.5 text-[13px] font-semibold">
                {amostrasDe(p.id) === 0 ? 'Nenhuma amostra entregue' : `${amostrasDe(p.id)} ${amostrasDe(p.id) === 1 ? 'amostra entregue' : 'amostras entregues'}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PotencialDetalhe() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const prospectos = useProspectos()
  const amostras = useAmostras()
  const produtos = useProdutos()
  const salvar = useSalvarProspecto()
  const [entregando, setEntregando] = useState(false)

  if (prospectos.isPending || produtos.isPending) return <Carregando />
  const p = prospectos.data?.find((x) => x.id === id)
  if (!p) return <Vazio>Potencial cliente não encontrado.</Vazio>

  const meu = ehGestao || p.representante_id === meuRepresentanteId
  const aberto = p.status === 'novo' || p.status === 'em_conversa'
  const entregas = (amostras.data ?? []).filter((a) => a.prospecto_id === p.id)
  const nome = (produtoId: string) => produtos.data?.find((x) => x.id === produtoId)?.nome_curto ?? '?'

  if (entregando) return <EntregarAmostra prospecto={p} aoFechar={() => setEntregando(false)} />

  return (
    <div className="space-y-4">
      <Titulo apoio={[p.endereco, p.bairro, p.cidade].filter(Boolean).join(' · ')}>{p.nome}</Titulo>

      <div className="flex flex-wrap gap-2">
        <Etiqueta tom={TOM[p.status]}>{NOME_PROSPECTO[p.status]}</Etiqueta>
        {p.segmento && <Etiqueta>{p.segmento}</Etiqueta>}
        <Etiqueta>Desde {data(p.criado_em)}</Etiqueta>
      </div>

      {(p.contato_nome || p.contato_telefone || p.observacoes) && (
        <Cartao>
          <Rotulo>Contato</Rotulo>
          <p className="mt-2 text-sm">{[p.contato_nome, p.contato_telefone].filter(Boolean).join(' · ')}</p>
          {p.observacoes && <p className="mt-2 text-sm whitespace-pre-line text-marrom/75">{p.observacoes}</p>}
        </Cartao>
      )}

      {meu && aberto && (
        <Botao cheio onClick={() => setEntregando(true)}>
          Registrar amostra entregue
        </Botao>
      )}

      <section className="space-y-2.5">
        <Rotulo>Amostras entregues</Rotulo>
        {entregas.length === 0 && <Vazio>Nenhuma amostra registrada.</Vazio>}
        {entregas.map((a) => (
          <Cartao key={a.id}>
            <p className="font-bold">{data(a.entregue_em)}</p>
            <p className="mt-1 text-sm">{a.amostra_itens.map((i) => `${nome(i.produto_id)} ${i.quantidade}`).join(' · ')}</p>
            {a.observacoes && <p className="mt-1 text-sm text-marrom/75">{a.observacoes}</p>}
          </Cartao>
        ))}
      </section>

      {meu && (
        <div className="space-y-3">
          <Aviso erro={salvar.error} />
          {aberto && (
            <>
              {/* Abre o cadastro de loja já preenchido; ao salvar, este potencial vira "Virou loja". */}
              <BotaoLink para={`/lojas/nova?potencial=${p.id}`} variante="secundario" cheio>
                Fechou. Cadastrar como loja
              </BotaoLink>
              <Botao variante="secundario" cheio disabled={salvar.isPending} onClick={() => salvar.mutateAsync({ id: p.id, status: 'descartado' }).then(() => navegar('/potenciais'))}>
                Não vai fechar. Descartar
              </Botao>
            </>
          )}
          {p.status === 'descartado' && (
            <Botao variante="secundario" cheio disabled={salvar.isPending} onClick={() => salvar.mutate({ id: p.id, status: 'em_conversa' })}>
              Reabrir conversa
            </Botao>
          )}
          {p.status === 'virou_loja' && p.loja_id && (
            <BotaoLink para={`/lojas/${p.loja_id}`} variante="secundario" cheio>
              Abrir a loja
            </BotaoLink>
          )}
          <BotaoLink para={`/potenciais/${p.id}/editar`} variante="discreto" cheio>
            Editar cadastro
          </BotaoLink>
        </div>
      )}
    </div>
  )
}

function EntregarAmostra({ prospecto, aoFechar }: { prospecto: Prospecto; aoFechar: () => void }) {
  const { meuRepresentanteId } = useAcesso()
  const produtos = useProdutos()
  const representantes = useRepresentantes()
  const registrar = useRegistrarAmostra()
  // Criado uma vez por entrega: reenviar não duplica.
  const [amostraId] = useState(() => crypto.randomUUID())
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [entregueEm, setEntregueEm] = useState(hoje())
  const [observacoes, setObservacoes] = useState('')

  // O estoque que sai é o de quem cuida deste potencial cliente.
  const dono = prospecto.representante_id
  const quem = dono === meuRepresentanteId ? 'você tem' : `${representantes.data?.find((r) => r.id === dono)?.nome ?? 'representante'} tem`
  const estoque = useEstoqueDeQuemVende(dono)
  const tem = estoque.disponivel
  const total = Object.values(quantidades).reduce((s, n) => s + n, 0)
  const ativos = (produtos.data ?? []).filter((p) => p.ativo)

  const [erroRetirada, setErroRetirada] = useState<unknown>(null)

  async function enviar() {
    setErroRetirada(null)
    const itens = Object.entries(quantidades).map(([produto_id, quantidade]) => ({ produto_id, quantidade }))
    try {
      await estoque.garantir(itens)
    } catch (e) {
      return setErroRetirada(e)
    }
    await registrar.mutateAsync({
      id: amostraId,
      prospectoId: prospecto.id,
      itens: Object.entries(quantidades).map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
      entregueEm,
      observacoes,
    })
    aoFechar()
  }

  return (
    <div className="space-y-4">
      <Titulo apoio={prospecto.nome}>Amostra entregue</Titulo>
      <p className="text-sm text-marrom/75">A amostra sai do estoque e não gera cobrança. Normalmente é um pacote.</p>

      <Cartao>
        {ativos.map((p) => (
          <Contador
            key={p.id}
            rotulo={p.nome_curto}
            apoio={`${quem} ${tem(p.id)}`}
            valor={quantidades[p.id] ?? 0}
            maximo={tem(p.id)}
            aoMudar={(n) => setQuantidades((q) => ({ ...q, [p.id]: n }))}
          />
        ))}
      </Cartao>

      {ativos.every((p) => tem(p.id) === 0) && (
        <Aviso>{estoque.direto ? 'Sem pacote pronto no app. Registre a produção em Estoque.' : 'Sem estoque no app para entregar amostra. Peça para registrarem a sua retirada na fábrica.'}</Aviso>
      )}

      <Campo rotulo="Dia da entrega" type="date" max={hoje()} value={entregueEm} onChange={(e) => setEntregueEm(e.target.value)} />
      <AreaDeTexto rotulo="Observações" valor={observacoes} aoMudar={setObservacoes} dica="Opcional. Com quem falou, o que achou." />
      {estoque.direto && <p className="text-xs text-marrom/65">Conta o que está com você e o que está na fábrica.</p>}
      <Aviso erro={erroRetirada ?? registrar.error} />
      <Botao cheio disabled={total === 0 || !entregueEm || registrar.isPending} onClick={enviar}>
        {registrar.isPending ? 'Gravando.' : `Gravar ${pacotes(total)} de amostra`}
      </Botao>
      <Botao variante="secundario" cheio onClick={aoFechar}>
        Cancelar
      </Botao>
    </div>
  )
}

const VAZIO = { nome: '', segmento: 'Arena de jogos de praia', endereco: '', bairro: '', cidade: 'Maringá', contato_nome: '', contato_telefone: '', observacoes: '', representante_id: '' }

export function PotencialForm() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const prospectos = useProspectos()
  const representantes = useRepresentantes()
  const salvar = useSalvarProspecto()
  const [form, setForm] = useState({ ...VAZIO, representante_id: meuRepresentanteId ?? '' })

  const existente = prospectos.data?.find((p) => p.id === id)
  useEffect(() => {
    if (existente) {
      setForm({
        nome: existente.nome,
        segmento: existente.segmento ?? '',
        endereco: existente.endereco ?? '',
        bairro: existente.bairro ?? '',
        cidade: existente.cidade,
        contato_nome: existente.contato_nome ?? '',
        contato_telefone: existente.contato_telefone ?? '',
        observacoes: existente.observacoes ?? '',
        representante_id: existente.representante_id,
      })
    }
  }, [existente])

  if (id && prospectos.isPending) return <Carregando />

  const campo = (nome: keyof typeof VAZIO) => ({
    value: form[nome],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [nome]: e.target.value })),
  })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const texto = (v: string) => v.trim() || null
    const dados: Partial<Prospecto> = {
      nome: form.nome.trim(),
      segmento: texto(form.segmento),
      endereco: texto(form.endereco),
      bairro: texto(form.bairro),
      cidade: form.cidade.trim() || 'Maringá',
      contato_nome: texto(form.contato_nome),
      contato_telefone: texto(form.contato_telefone),
      observacoes: texto(form.observacoes),
    }
    // Só a gestão escolhe (ou troca) quem cuida do potencial cliente.
    if (ehGestao) dados.representante_id = form.representante_id
    else if (!id) dados.representante_id = meuRepresentanteId!
    const salvo = await salvar.mutateAsync(id ? { id, ...dados } : dados)
    navegar(`/potenciais/${salvo.id}`, { replace: true })
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Titulo apoio="Cadastro rápido. O endereço completo fica para quando virar loja.">{id ? 'Editar potencial cliente' : 'Novo potencial cliente'}</Titulo>
      <Campo rotulo="Nome do lugar" required {...campo('nome')} />
      <CampoSegmento valor={form.segmento} aoMudar={(segmento) => setForm((f) => ({ ...f, segmento }))} />
      <Campo rotulo="Rua e número" {...campo('endereco')} />
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Bairro" {...campo('bairro')} />
        <Campo rotulo="Cidade" {...campo('cidade')} />
      </div>
      <Campo rotulo="Nome do contato" {...campo('contato_nome')} />
      <Campo rotulo="WhatsApp do contato" type="tel" inputMode="tel" placeholder="(44) 90000-0000" {...campo('contato_telefone')} />

      {ehGestao && (
        <Selecao rotulo="Quem cuida" required {...campo('representante_id')}>
          <option value="">Escolha</option>
          {representantes.data?.filter((r) => r.ativo || r.id === form.representante_id).map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </Selecao>
      )}

      <AreaDeTexto rotulo="Observações" valor={form.observacoes} aoMudar={(v) => setForm((f) => ({ ...f, observacoes: v }))} dica="Como foi a conversa, quando voltar." />
      <Aviso erro={salvar.error} />
      <Botao type="submit" cheio disabled={salvar.isPending}>
        {salvar.isPending ? 'Salvando.' : 'Salvar'}
      </Botao>
      <Botao variante="secundario" cheio onClick={() => navegar(-1)}>
        Cancelar
      </Botao>
    </form>
  )
}
