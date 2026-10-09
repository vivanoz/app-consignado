import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Atividades } from '../components/Atividades'
import { Interacoes } from '../components/Interacoes'
import { CampoSegmento } from '../components/Segmento'
import { AreaDeTexto, Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, Contador, Etiqueta, Rotulo, Selecao, Titulo, Vazio } from '../components/ui'
import { useAmostras, useProdutos, useProspectos, useRegistrarAmostra, useRepresentantes, useSalvarProspecto } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { useEstoqueDeQuemVende } from '../lib/estoque'
import { ETAPAS, MOTIVOS_DE_PERDA, NOME_ETAPA, NOME_TEMPERATURA, TOM_ETAPA, emAndamento } from '../lib/crm'
import { data, diasDesde, hoje, pacotes, reais } from '../lib/formato'
import type { Prospecto } from '../lib/tipos'

export function PotencialDetalhe() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const prospectos = useProspectos()
  const amostras = useAmostras()
  const produtos = useProdutos()
  const salvar = useSalvarProspecto()
  const [entregando, setEntregando] = useState(false)
  const [perdendo, setPerdendo] = useState(false)
  const [motivo, setMotivo] = useState(MOTIVOS_DE_PERDA[0])
  const [outroMotivo, setOutroMotivo] = useState('')

  if (prospectos.isPending || produtos.isPending) return <Carregando />
  const p = prospectos.data?.find((x) => x.id === id)
  if (!p) return <Vazio>Lead não encontrado.</Vazio>

  const meu = ehGestao || p.representante_id === meuRepresentanteId
  const aberto = emAndamento(p.status)
  const entregas = (amostras.data ?? []).filter((a) => a.prospecto_id === p.id)
  const nome = (produtoId: string) => produtos.data?.find((x) => x.id === produtoId)?.nome_curto ?? '?'

  if (entregando) return <EntregarAmostra prospecto={p} aoFechar={() => setEntregando(false)} />

  return (
    <div className="space-y-4">
      <Titulo apoio={[p.endereco, p.bairro, p.cidade].filter(Boolean).join(' · ')}>{p.nome}</Titulo>

      <div className="flex flex-wrap gap-2">
        <Etiqueta tom={TOM_ETAPA[p.status]}>{NOME_ETAPA[p.status]}</Etiqueta>
        {p.temperatura && <Etiqueta tom={p.temperatura === 'quente' ? 'alerta' : p.temperatura === 'morno' ? 'ouro' : 'neutro'}>{NOME_TEMPERATURA[p.temperatura]}</Etiqueta>}
        {p.origem && <Etiqueta>{p.origem}</Etiqueta>}
        {p.segmento && <Etiqueta>{p.segmento}</Etiqueta>}
        <Etiqueta>Desde {data(p.criado_em)}</Etiqueta>
      </div>

      {(Number(p.valor_estimado) > 0 || p.previsao_fechamento || aberto) && (
        <div className="grid grid-cols-2 gap-3">
          <Cartao>
            <Rotulo>Valor estimado</Rotulo>
            <p className="mt-1 text-xl font-bold">{Number(p.valor_estimado) > 0 ? reais(Number(p.valor_estimado)) : 'Não informado'}</p>
            <p className="text-xs text-marrom/65">por mês, se fechar</p>
          </Cartao>
          <Cartao>
            <Rotulo>Nesta etapa</Rotulo>
            <p className="mt-1 text-xl font-bold">{diasDesde(p.etapa_desde) === 0 ? 'desde hoje' : `há ${diasDesde(p.etapa_desde)} dias`}</p>
            <p className="text-xs text-marrom/65">{p.previsao_fechamento ? `previsão de fechar em ${data(p.previsao_fechamento)}` : 'sem previsão de fechamento'}</p>
          </Cartao>
        </div>
      )}

      {p.status === 'descartado' && (
        <Cartao className="border-alerta/40 bg-alerta/8">
          <Rotulo>Motivo da perda</Rotulo>
          <p className="mt-1 text-sm font-semibold">{p.motivo_perda}</p>
          {p.encerrado_em && <p className="text-xs text-marrom/65">Perdido em {data(p.encerrado_em)}</p>}
        </Cartao>
      )}

      {(p.contato_nome || p.contato_telefone || p.observacoes) && (
        <Cartao>
          <Rotulo>Contato</Rotulo>
          <p className="mt-2 text-sm">{[p.contato_nome, p.contato_telefone].filter(Boolean).join(' · ')}</p>
          {p.observacoes && <p className="mt-2 text-sm whitespace-pre-line text-marrom/75">{p.observacoes}</p>}
        </Cartao>
      )}

      {meu && aberto && (
        <Cartao>
          <Rotulo>Etapa do funil</Rotulo>
          <div className="mt-3 flex flex-wrap gap-2">
            {ETAPAS.filter((e) => e.id !== 'virou_loja').map((e) => (
              <button
                key={e.id}
                type="button"
                aria-pressed={p.status === e.id}
                disabled={salvar.isPending}
                onClick={() => p.status !== e.id && salvar.mutate({ id: p.id, status: e.id })}
                className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${p.status === e.id ? 'border-verde bg-verde text-creme' : 'border-marrom/30 text-marrom/75'}`}
              >
                {e.nome}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-marrom/65">{ETAPAS.find((e) => e.id === p.status)?.explica} Para a etapa Cliente, use "Fechou. Cadastrar como loja".</p>
        </Cartao>
      )}

      {meu && aberto && (
        <Botao cheio onClick={() => setEntregando(true)}>
          Registrar amostra entregue
        </Botao>
      )}

      {meu && (
        <section className="space-y-2.5">
          <Rotulo>Próximos passos</Rotulo>
          <Atividades de={{ prospectoId: p.id }} compacto />
        </section>
      )}

      {meu && (
        <section className="space-y-2.5">
          <Rotulo>Histórico de contato</Rotulo>
          <Interacoes de={{ prospectoId: p.id }} representanteId={p.representante_id} />
        </section>
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
              {perdendo ? (
                <Cartao className="space-y-3">
                  <Rotulo>Por que não fechou</Rotulo>
                  <Selecao rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    {MOTIVOS_DE_PERDA.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="outro">Outro motivo</option>
                  </Selecao>
                  {motivo === 'outro' && <Campo rotulo="Qual motivo" value={outroMotivo} onChange={(e) => setOutroMotivo(e.target.value)} />}
                  <Botao
                    cheio
                    disabled={salvar.isPending || (motivo === 'outro' && !outroMotivo.trim())}
                    onClick={() => salvar.mutateAsync({ id: p.id, status: 'descartado', motivo_perda: motivo === 'outro' ? outroMotivo.trim() : motivo }).then(() => navegar('/crm'))}
                  >
                    Marcar como perdido
                  </Botao>
                  <Botao variante="discreto" cheio onClick={() => setPerdendo(false)}>
                    Cancelar
                  </Botao>
                </Cartao>
              ) : (
                <Botao variante="secundario" cheio onClick={() => setPerdendo(true)}>
                  Não vai fechar. Marcar como perdido
                </Botao>
              )}
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
          <BotaoLink para={`/crm/${p.id}/editar`} variante="discreto" cheio>
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

const VAZIO = { nome: '', segmento: 'Arena de jogos de praia', endereco: '', bairro: '', cidade: 'Maringá', contato_nome: '', contato_telefone: '', origem: '', observacoes: '', representante_id: '', valor_estimado: '', previsao_fechamento: '', temperatura: '' }

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
        origem: existente.origem ?? '',
        valor_estimado: existente.valor_estimado ? String(existente.valor_estimado).replace('.', ',') : '',
        previsao_fechamento: existente.previsao_fechamento ?? '',
        temperatura: existente.temperatura ?? '',
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
      origem: texto(form.origem),
      observacoes: texto(form.observacoes),
      valor_estimado: Number(form.valor_estimado.replace(',', '.')) || null,
      previsao_fechamento: form.previsao_fechamento || null,
      temperatura: (form.temperatura || null) as Prospecto['temperatura'],
    }
    // Só a gestão escolhe (ou troca) quem cuida do potencial cliente.
    if (ehGestao) dados.representante_id = form.representante_id
    else if (!id) dados.representante_id = meuRepresentanteId!
    const salvo = await salvar.mutateAsync(id ? { id, ...dados } : dados)
    navegar(`/crm/${salvo.id}`, { replace: true })
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Titulo apoio="Cadastro rápido. O endereço completo fica para quando virar loja.">{id ? 'Editar lead' : 'Novo lead'}</Titulo>
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

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Valor estimado por mês (R$)" inputMode="decimal" pattern="\d*([.,]\d{1,2})?" placeholder="300" {...campo('valor_estimado')} />
        <Campo rotulo="Previsão de fechar" type="date" {...campo('previsao_fechamento')} />
      </div>
      <Selecao rotulo="Temperatura" {...campo('temperatura')}>
        <option value="">Não definida</option>
        <option value="quente">Quente: quer fechar logo</option>
        <option value="morno">Morno: interessado, sem pressa</option>
        <option value="frio">Frio: pouco interesse por enquanto</option>
      </Selecao>
      <Campo rotulo="De onde veio este lead" placeholder="Indicação, lista, Instagram, passou na frente." {...campo('origem')} />
      <AreaDeTexto rotulo="Observações" valor={form.observacoes} aoMudar={(v) => setForm((f) => ({ ...f, observacoes: v }))} dica="O que vale saber sobre o lugar." />
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
