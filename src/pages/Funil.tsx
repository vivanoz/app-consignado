import { useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Botao, BotaoLink, Cartao, Carregando, Rotulo, Selecao } from '../components/ui'
import { useAmostras, useAtividades, useContatos, useProspectos, useRepresentantes, useSalvarProspecto } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { DIAS_PARADO, ETAPAS, NOME_TEMPERATURA, emAndamento, quando } from '../lib/crm'
import { diasDesde, hoje, inicioDoMes, reais } from '../lib/formato'
import type { Prospecto, ProspectoStatus } from '../lib/tipos'

const soma = (valores: (number | null)[]) => valores.reduce<number>((s, v) => s + Number(v ?? 0), 0)

// Dados que o funil e os indicadores usam, já filtrados por responsável.
function useLeads(dono: string) {
  const prospectos = useProspectos()
  const amostras = useAmostras()
  const atividades = useAtividades()
  const contatos = useContatos()

  const leads = (prospectos.data ?? []).filter((p) => !dono || p.representante_id === dono)
  return {
    carregando: prospectos.isPending,
    erro: prospectos.error,
    leads,
    atividades: (atividades.data ?? []).filter((a) => !dono || a.representante_id === dono),
    amostrasDe: (id: string) =>
      (amostras.data ?? []).filter((a) => a.prospecto_id === id).reduce((s, a) => s + a.amostra_itens.reduce((t, i) => t + i.quantidade, 0), 0),
    proximoPasso: (id: string) =>
      (atividades.data ?? [])
        .filter((a) => a.prospecto_id === id && !a.concluida_em)
        .map((a) => a.vence_em)
        .sort()[0],
    // Dias sem movimento: o mais recente entre o último contato e a entrada na etapa.
    parado: (p: Prospecto) => {
      const contato = contatos.data?.find((c) => c.prospecto_id === p.id)?.ultimo_contato
      return diasDesde(contato && contato > p.etapa_desde ? contato : p.etapa_desde)
    },
  }
}

function FiltroDeDono({ dono, setDono }: { dono: string; setDono: (id: string) => void }) {
  const { ehGestao } = useAcesso()
  const representantes = useRepresentantes()
  if (!ehGestao || (representantes.data?.length ?? 0) < 2) return null
  return (
    <Selecao rotulo="De quem" value={dono} onChange={(e) => setDono(e.target.value)}>
      <option value="">Toda a equipe</option>
      {representantes.data?.map((r) => (
        <option key={r.id} value={r.id}>
          {r.nome}
        </option>
      ))}
    </Selecao>
  )
}

// ───────────────────────── Funil ─────────────────────────

export function Funil() {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const representantes = useRepresentantes()
  const salvar = useSalvarProspecto()
  const [dono, setDono] = useState('')
  const [busca, setBusca] = useState('')
  const [verPerdidos, setVerPerdidos] = useState(false)
  const [sobre, setSobre] = useState<ProspectoStatus | null>(null)
  const dados = useLeads(dono)

  if (dados.carregando) return <Carregando />
  if (dados.erro) return <Aviso erro={dados.erro} />

  const termo = busca.trim().toLowerCase()
  const leads = dados.leads.filter((p) => !termo || `${p.nome} ${p.bairro ?? ''} ${p.contato_nome ?? ''} ${p.segmento ?? ''}`.toLowerCase().includes(termo))
  const emAberto = leads.filter((p) => emAndamento(p.status))
  const perdidos = leads.filter((p) => p.status === 'descartado')
  const proxima = (status: ProspectoStatus) => {
    const i = ETAPAS.findIndex((e) => e.id === status)
    const seguinte = ETAPAS[i + 1]
    // A última etapa (Cliente) só se alcança cadastrando a loja.
    return seguinte && seguinte.id !== 'virou_loja' ? seguinte : null
  }

  // No computador dá para arrastar o card de uma coluna para outra.
  function soltar(e: DragEvent, etapa: ProspectoStatus) {
    e.preventDefault()
    setSobre(null)
    const id = e.dataTransfer.getData('text/plain')
    const lead = leads.find((p) => p.id === id)
    if (lead && lead.status !== etapa && etapa !== 'virou_loja') salvar.mutate({ id, status: etapa })
  }

  return (
    <div className="space-y-4">
      {(ehGestao || meuRepresentanteId) && (
        <div className="grid grid-cols-2 gap-3">
          <BotaoLink para="/crm/novo">Novo lead</BotaoLink>
          <BotaoLink para="/crm/importar" variante="secundario">
            Importar Excel
          </BotaoLink>
        </div>
      )}

      <FiltroDeDono dono={dono} setDono={setDono} />

      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, bairro, contato ou segmento"
        className="block min-h-12 w-full rounded-xl border border-marrom/25 bg-white/70 px-3 text-base"
      />

      <p className="text-sm text-marrom/75">
        {emAberto.length} {emAberto.length === 1 ? 'lead em andamento' : 'leads em andamento'}
        {soma(emAberto.map((p) => p.valor_estimado)) > 0 && `, ${reais(soma(emAberto.map((p) => p.valor_estimado)))} por mês em jogo`}. Deslize para o lado para ver as etapas.
      </p>
      <Aviso erro={salvar.error} />

      {/* Uma coluna por etapa. No celular, rola para o lado e para em cada coluna. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {ETAPAS.map((etapa) => {
          const daEtapa = leads.filter((p) => p.status === etapa.id)
          const visiveis = etapa.id === 'virou_loja' ? daEtapa.slice(0, 8) : daEtapa
          const valor = soma(daEtapa.map((p) => p.valor_estimado))
          return (
            <section
              key={etapa.id}
              onDragOver={(e) => {
                if (etapa.id === 'virou_loja') return
                e.preventDefault()
                setSobre(etapa.id)
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={(e) => soltar(e, etapa.id)}
              className={`w-[78vw] max-w-[300px] shrink-0 snap-start rounded-2xl border p-3 ${sobre === etapa.id ? 'border-verde bg-verde/10' : 'border-linha bg-papel/60'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <Rotulo>{etapa.nome}</Rotulo>
                <span className="text-sm font-bold">{daEtapa.length}</span>
              </div>
              <p className="mb-2 text-[11px] leading-tight text-marrom/60">
                {valor > 0 ? `${reais(valor)} por mês` : etapa.explica}
              </p>
              <ul className="space-y-2">
                {visiveis.map((p) => {
                  const seguinte = proxima(p.status)
                  return (
                    <li key={p.id}>
                      <CartaoLead
                        lead={p}
                        amostras={dados.amostrasDe(p.id)}
                        proximo={dados.proximoPasso(p.id)}
                        parado={dados.parado(p)}
                        dono={ehGestao ? representantes.data?.find((r) => r.id === p.representante_id)?.nome : undefined}
                        avancar={seguinte ? { nome: seguinte.nome, agora: () => salvar.mutate({ id: p.id, status: seguinte.id }), ocupado: salvar.isPending } : undefined}
                      />
                    </li>
                  )
                })}
              </ul>
              {daEtapa.length === 0 && <p className="py-4 text-center text-xs text-marrom/50">Ninguém nesta etapa.</p>}
              {visiveis.length < daEtapa.length && <p className="pt-2 text-center text-xs text-marrom/60">e mais {daEtapa.length - visiveis.length}, em Clientes.</p>}
            </section>
          )
        })}
      </div>

      {perdidos.length > 0 && (
        <div>
          <Botao variante="discreto" onClick={() => setVerPerdidos(!verPerdidos)}>
            {verPerdidos ? 'Esconder perdidos' : `Ver ${perdidos.length} ${perdidos.length === 1 ? 'perdido' : 'perdidos'}`}
          </Botao>
          {verPerdidos && (
            <ul className="mt-2 space-y-2">
              {perdidos.map((p) => (
                <li key={p.id}>
                  <CartaoLead lead={p} amostras={dados.amostrasDe(p.id)} parado={0} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const COR_TEMPERATURA: Record<string, string> = { quente: 'bg-alerta', morno: 'bg-ouro', frio: 'bg-marrom/30' }

function CartaoLead({
  lead,
  amostras,
  proximo,
  parado,
  dono,
  avancar,
}: {
  lead: Prospecto
  amostras: number
  proximo?: string
  parado: number
  dono?: string
  avancar?: { nome: string; agora: () => void; ocupado: boolean }
}) {
  const aberto = emAndamento(lead.status)
  const esquecido = aberto && parado >= DIAS_PARADO
  return (
    <div
      draggable={aberto}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', lead.id)}
      className={`rounded-xl border bg-papel ${esquecido ? 'border-alerta/50' : 'border-linha'}`}
    >
      <Link to={`/crm/${lead.id}`} className="block p-3 active:bg-areia/25">
        <p className="flex items-start gap-2 leading-snug font-bold">
          {lead.temperatura && <span title={NOME_TEMPERATURA[lead.temperatura]} className={`mt-1.5 size-2.5 shrink-0 rounded-full ${COR_TEMPERATURA[lead.temperatura]}`} />}
          <span>{lead.nome}</span>
        </p>
        <p className="text-xs text-marrom/65">{[lead.bairro, lead.segmento, dono].filter(Boolean).join(' · ')}</p>
        {(Number(lead.valor_estimado) > 0 || amostras > 0) && (
          <p className="mt-1 text-xs font-semibold">
            {[Number(lead.valor_estimado) > 0 && `${reais(Number(lead.valor_estimado))} por mês`, amostras > 0 && (amostras === 1 ? '1 amostra' : `${amostras} amostras`)].filter(Boolean).join(' · ')}
          </p>
        )}
        {aberto && (
          <p className={`mt-1 text-xs font-semibold ${proximo ? (proximo < hoje() ? 'text-alerta' : 'text-verde') : 'text-alerta'}`}>
            {proximo ? `Próximo passo ${quando(proximo)}` : 'Sem próximo passo marcado'}
          </p>
        )}
        {esquecido && <p className="text-xs text-alerta">Parado há {parado} dias</p>}
        {lead.status === 'descartado' && lead.motivo_perda && <p className="mt-1 text-xs text-marrom/65">Motivo: {lead.motivo_perda}</p>}
      </Link>
      {avancar && (
        <button
          type="button"
          disabled={avancar.ocupado}
          onClick={avancar.agora}
          className="block min-h-10 w-full border-t border-linha px-3 text-left text-xs font-semibold text-verde active:bg-verde/10 disabled:opacity-50"
        >
          Avançar para {avancar.nome} →
        </button>
      )}
    </div>
  )
}

// ───────────────────────── Indicadores ─────────────────────────

export function Indicadores() {
  const [dono, setDono] = useState('')
  const dados = useLeads(dono)

  if (dados.carregando) return <Carregando />
  if (dados.erro) return <Aviso erro={dados.erro} />

  const { leads } = dados
  const abertos = leads.filter((p) => emAndamento(p.status))
  const ganhos = leads.filter((p) => p.status === 'virou_loja')
  const perdidos = leads.filter((p) => p.status === 'descartado')
  const encerrados = ganhos.length + perdidos.length
  const noMes = (p: Prospecto) => (p.encerrado_em ?? '').slice(0, 10) >= inicioDoMes()
  const diasAteGanhar = ganhos.filter((p) => p.encerrado_em).map((p) => Math.max(0, Math.round((new Date(p.encerrado_em!).getTime() - new Date(p.criado_em).getTime()) / 86_400_000)))
  const semPasso = abertos.filter((p) => !dados.proximoPasso(p.id))
  const parados = abertos.filter((p) => dados.parado(p) >= DIAS_PARADO)
  const feitasNoMes = dados.atividades.filter((a) => (a.concluida_em ?? '').slice(0, 10) >= inicioDoMes()).length
  const atrasadas = dados.atividades.filter((a) => !a.concluida_em && a.vence_em < hoje()).length
  const maior = Math.max(1, ...ETAPAS.map((e) => leads.filter((p) => p.status === e.id).length))
  const motivos = Object.entries(
    perdidos.reduce<Record<string, number>>((conta, p) => {
      const motivo = p.motivo_perda || 'Sem motivo registrado'
      conta[motivo] = (conta[motivo] ?? 0) + 1
      return conta
    }, {}),
  ).sort((a, b) => b[1] - a[1])
  const origens = Object.entries(
    leads.reduce<Record<string, { total: number; ganhos: number }>>((conta, p) => {
      const origem = p.origem || 'Sem origem registrada'
      conta[origem] ??= { total: 0, ganhos: 0 }
      conta[origem].total += 1
      if (p.status === 'virou_loja') conta[origem].ganhos += 1
      return conta
    }, {}),
  ).sort((a, b) => b[1].total - a[1].total)

  const numero = (rotulo: string, valor: string | number, apoio?: string, alerta = false) => (
    <Cartao>
      <Rotulo>{rotulo}</Rotulo>
      <p className={`mt-2 text-2xl font-bold ${alerta ? 'text-alerta' : ''}`}>{valor}</p>
      {apoio && <p className="text-xs text-marrom/65">{apoio}</p>}
    </Cartao>
  )

  return (
    <div className="space-y-4">
      <FiltroDeDono dono={dono} setDono={setDono} />

      <div className="grid grid-cols-2 gap-3">
        {numero('Em andamento', abertos.length, soma(abertos.map((p) => p.valor_estimado)) > 0 ? `${reais(soma(abertos.map((p) => p.valor_estimado)))} por mês em jogo` : 'leads no funil')}
        {numero('Taxa de ganho', encerrados > 0 ? `${Math.round((ganhos.length / encerrados) * 100)}%` : '–', `${ganhos.length} ganhos de ${encerrados} encerrados`)}
        {numero('Ganhos no mês', ganhos.filter(noMes).length, `${perdidos.filter(noMes).length} perdidos no mês`)}
        {numero('Tempo até fechar', diasAteGanhar.length > 0 ? `${Math.round(diasAteGanhar.reduce((s, d) => s + d, 0) / diasAteGanhar.length)} dias` : '–', 'média do cadastro ao fechamento')}
        {numero('Sem próximo passo', semPasso.length, 'leads abertos sem lembrete', semPasso.length > 0)}
        {numero(`Parados há ${DIAS_PARADO} dias`, parados.length, 'sem contato nem mudança de etapa', parados.length > 0)}
        {numero('Atividades feitas', feitasNoMes, 'concluídas neste mês')}
        {numero('Atividades atrasadas', atrasadas, 'em aberto e vencidas', atrasadas > 0)}
      </div>

      <Cartao>
        <Rotulo>Leads por etapa</Rotulo>
        <div className="mt-3 space-y-2.5">
          {ETAPAS.map((e) => {
            const n = leads.filter((p) => p.status === e.id).length
            return (
              <div key={e.id}>
                <div className="flex justify-between text-sm">
                  <span>{e.nome}</span>
                  <strong>{n}</strong>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-creme">
                  <div className="h-2.5 rounded-full bg-verde" style={{ width: `${(n / maior) * 100}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </Cartao>

      {motivos.length > 0 && (
        <Cartao>
          <Rotulo>Por que perdemos</Rotulo>
          <ul className="mt-2 divide-y divide-linha text-sm">
            {motivos.map(([motivo, n]) => (
              <li key={motivo} className="flex justify-between gap-3 py-1.5">
                <span>{motivo}</span>
                <strong>{n}</strong>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {origens.length > 0 && (
        <Cartao>
          <Rotulo>De onde vêm os leads</Rotulo>
          <ul className="mt-2 divide-y divide-linha text-sm">
            {origens.map(([origem, o]) => (
              <li key={origem} className="flex justify-between gap-3 py-1.5">
                <span>{origem}</span>
                <span className="whitespace-nowrap">
                  <strong>{o.total}</strong> {o.total === 1 ? 'lead' : 'leads'} · {o.ganhos} {o.ganhos === 1 ? 'virou cliente' : 'viraram clientes'}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  )
}
