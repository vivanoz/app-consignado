import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Atividades } from '../components/Atividades'
import { Aviso, Botao, BotaoLink, Cartao, Carregando, Rotulo, Selecao, Titulo, Vazio } from '../components/ui'
import { useAmostras, useAtividades, useImportarProspectos, useProspectos, useRepresentantes } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { ETAPAS, emAndamento, quando } from '../lib/crm'
import type { Prospecto } from '../lib/tipos'

// CRM: os potenciais clientes no funil e o que precisa ser feito, um a um.
export function Crm() {
  const [aba, setAba] = useState<'atividades' | 'funil'>(() => (sessionStorage.getItem('vivanoz:crm') === 'funil' ? 'funil' : 'atividades'))
  const trocar = (a: 'atividades' | 'funil') => {
    sessionStorage.setItem('vivanoz:crm', a)
    setAba(a)
  }

  return (
    <div className="space-y-4">
      <Titulo apoio="Potenciais clientes e o que precisa ser feito.">CRM</Titulo>
      <div className="flex rounded-xl border border-linha bg-papel p-1">
        {(
          [
            ['atividades', 'Atividades'],
            ['funil', 'Funil de vendas'],
          ] as const
        ).map(([id, nome]) => (
          <button key={id} type="button" onClick={() => trocar(id)} className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${aba === id ? 'bg-verde text-creme' : 'text-marrom/70'}`}>
            {nome}
          </button>
        ))}
      </div>
      {aba === 'atividades' ? <Atividades /> : <Funil />}
    </div>
  )
}

function Funil() {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const prospectos = useProspectos()
  const amostras = useAmostras()
  const atividades = useAtividades()
  const representantes = useRepresentantes()
  const [dono, setDono] = useState('')
  const [verPerdidos, setVerPerdidos] = useState(false)

  if (prospectos.isPending) return <Carregando />
  if (prospectos.error) return <Aviso erro={prospectos.error} />

  const leads = prospectos.data.filter((p) => !dono || p.representante_id === dono)
  const emAberto = leads.filter((p) => emAndamento(p.status))
  const perdidos = leads.filter((p) => p.status === 'descartado')
  const amostrasDe = (id: string) =>
    (amostras.data ?? []).filter((a) => a.prospecto_id === id).reduce((s, a) => s + a.amostra_itens.reduce((t, i) => t + i.quantidade, 0), 0)
  const proximoPasso = (id: string) =>
    (atividades.data ?? [])
      .filter((a) => a.prospecto_id === id && !a.concluida_em)
      .map((a) => a.vence_em)
      .sort()[0]

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

      {ehGestao && (representantes.data?.length ?? 0) > 1 && (
        <Selecao rotulo="De quem" value={dono} onChange={(e) => setDono(e.target.value)}>
          <option value="">Toda a equipe</option>
          {representantes.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </Selecao>
      )}

      <p className="text-sm text-marrom/75">
        {emAberto.length} {emAberto.length === 1 ? 'lead em andamento' : 'leads em andamento'}. Deslize para o lado para ver as etapas.
      </p>

      {/* Uma coluna por etapa. No celular, rola para o lado e para em cada coluna. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {ETAPAS.map((etapa) => {
          const daEtapa = leads.filter((p) => p.status === etapa.id)
          const visiveis = etapa.id === 'virou_loja' ? daEtapa.slice(0, 8) : daEtapa
          return (
            <section key={etapa.id} className="w-[78vw] max-w-[300px] shrink-0 snap-start rounded-2xl border border-linha bg-papel/60 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <Rotulo>{etapa.nome}</Rotulo>
                <span className="text-sm font-bold">{daEtapa.length}</span>
              </div>
              <p className="mb-2 text-[11px] leading-tight text-marrom/60">{etapa.explica}</p>
              <ul className="space-y-2">
                {visiveis.map((p) => (
                  <li key={p.id}>
                    <CartaoLead lead={p} amostras={amostrasDe(p.id)} proximo={proximoPasso(p.id)} dono={ehGestao ? representantes.data?.find((r) => r.id === p.representante_id)?.nome : undefined} />
                  </li>
                ))}
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
                  <CartaoLead lead={p} amostras={amostrasDe(p.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CartaoLead({ lead, amostras, proximo, dono }: { lead: Prospecto; amostras: number; proximo?: string; dono?: string }) {
  const aberto = emAndamento(lead.status)
  return (
    <Link to={`/crm/${lead.id}`} className="block rounded-xl border border-linha bg-papel p-3 active:bg-areia/25">
      <p className="leading-snug font-bold">{lead.nome}</p>
      <p className="text-xs text-marrom/65">{[lead.bairro, lead.segmento, dono].filter(Boolean).join(' · ')}</p>
      {amostras > 0 && <p className="mt-1 text-xs font-semibold">{amostras === 1 ? '1 amostra entregue' : `${amostras} amostras entregues`}</p>}
      {aberto && (
        <p className={`mt-1 text-xs font-semibold ${proximo ? 'text-verde' : 'text-alerta'}`}>{proximo ? `Próximo passo ${quando(proximo)}` : 'Sem próximo passo marcado'}</p>
      )}
    </Link>
  )
}

// ───────────────────────── Importação por Excel ─────────────────────────

const COLUNAS = [
  { campo: 'nome', titulo: 'Nome do lugar', exemplo: 'Arena Exemplo Beach Tennis' },
  { campo: 'segmento', titulo: 'Segmento', exemplo: 'Arena de jogos de praia' },
  { campo: 'endereco', titulo: 'Rua e número', exemplo: 'Avenida Exemplo, 100' },
  { campo: 'bairro', titulo: 'Bairro', exemplo: 'Zona 7' },
  { campo: 'cidade', titulo: 'Cidade', exemplo: 'Maringá' },
  { campo: 'contato_nome', titulo: 'Nome do contato', exemplo: 'João' },
  { campo: 'contato_telefone', titulo: 'WhatsApp', exemplo: '(44) 90000-0000' },
  { campo: 'origem', titulo: 'Origem', exemplo: 'Lista de arenas de Maringá' },
  { campo: 'observacoes', titulo: 'Observações', exemplo: 'Indicado por um cliente' },
] as const

type Campo = (typeof COLUNAS)[number]['campo']
type LinhaLida = Record<Campo, string>

// Compara títulos e nomes sem acento, sem maiúscula e sem espaço sobrando.
const limpo = (texto: unknown) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

async function baixarModelo() {
  const { default: escrever } = await import('write-excel-file/browser')
  await escrever(
    [
      COLUNAS.map((c) => ({ value: c.titulo, fontWeight: 'bold' as const })),
      COLUNAS.map((c) => ({ value: c.exemplo })),
    ],
    { columns: COLUNAS.map(() => ({ width: 28 })) },
  ).toFile('Viva Noz - modelo de leads.xlsx')
}

export function ImportarLeads() {
  const navegar = useNavigate()
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const representantes = useRepresentantes()
  const prospectos = useProspectos()
  const importar = useImportarProspectos()
  const [dono, setDono] = useState(meuRepresentanteId ?? '')
  const [arquivo, setArquivo] = useState('')
  const [prontos, setProntos] = useState<LinhaLida[]>([])
  const [recusados, setRecusados] = useState<string[]>([])
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState<number | null>(null)

  async function ler(file: File | undefined) {
    setErro('')
    setProntos([])
    setRecusados([])
    setFeito(null)
    if (!file) return
    setArquivo(file.name)
    try {
      const { readSheet } = await import('read-excel-file/browser')
      const linhas = await readSheet(file)
      if (linhas.length < 2) return setErro('A planilha está vazia. Preencha a partir da segunda linha do modelo.')

      const titulos = linhas[0].map(limpo)
      const posicao = Object.fromEntries(COLUNAS.map((c) => [c.campo, titulos.indexOf(limpo(c.titulo))])) as Record<Campo, number>
      if (posicao.nome < 0) return setErro('Não achei a coluna "Nome do lugar". Use o modelo, sem mudar os títulos da primeira linha.')

      const jaExistem = new Set((prospectos.data ?? []).map((p) => `${limpo(p.nome)}|${limpo(p.bairro)}`))
      const bons: LinhaLida[] = []
      const ruins: string[] = []
      linhas.slice(1).forEach((linha, i) => {
        const lida = Object.fromEntries(COLUNAS.map((c) => [c.campo, posicao[c.campo] >= 0 ? String(linha[posicao[c.campo]] ?? '').trim() : ''])) as LinhaLida
        if (Object.values(lida).every((v) => v === '')) return
        const chave = `${limpo(lida.nome)}|${limpo(lida.bairro)}`
        if (!lida.nome) ruins.push(`Linha ${i + 2}: sem nome do lugar.`)
        else if (jaExistem.has(chave)) ruins.push(`Linha ${i + 2}: "${lida.nome}" já está cadastrado.`)
        else {
          jaExistem.add(chave)
          bons.push(lida)
        }
      })
      setProntos(bons)
      setRecusados(ruins)
      if (bons.length === 0 && ruins.length === 0) setErro('Não há nenhuma linha preenchida abaixo dos títulos.')
    } catch {
      setErro('Não consegui ler o arquivo. Ele precisa ser uma planilha do Excel (.xlsx), salva a partir do modelo.')
    }
  }

  async function enviar() {
    const texto = (v: string) => v || null
    await importar.mutateAsync(
      prontos.map((l) => ({
        nome: l.nome,
        segmento: texto(l.segmento),
        endereco: texto(l.endereco),
        bairro: texto(l.bairro),
        cidade: l.cidade || 'Maringá',
        contato_nome: texto(l.contato_nome),
        contato_telefone: texto(l.contato_telefone),
        origem: l.origem || `Planilha ${arquivo}`,
        observacoes: texto(l.observacoes),
        representante_id: ehGestao ? dono : meuRepresentanteId!,
      })),
    )
    setFeito(prontos.length)
    setProntos([])
  }

  if (feito !== null) {
    return (
      <div className="space-y-4">
        <Titulo>Importação concluída.</Titulo>
        <Cartao>
          <p className="text-sm">
            {feito === 1 ? 'Um lead entrou' : `${feito} leads entraram`} no funil, na etapa "Novo lead".
          </p>
        </Cartao>
        <Botao cheio onClick={() => navegar('/crm')}>
          Ver o funil
        </Botao>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Titulo apoio="Traga uma lista de potenciais clientes de uma planilha do Excel.">Importar leads</Titulo>

      <Cartao className="space-y-3">
        <Rotulo>1. Use o modelo</Rotulo>
        <p className="text-sm text-marrom/80">Baixe o modelo, preencha uma linha por lugar e não mude os títulos da primeira linha. Só o nome do lugar é obrigatório. Apague a linha de exemplo.</p>
        <Botao variante="secundario" cheio onClick={() => baixarModelo().catch(() => setErro('Não consegui gerar o modelo. Tente de novo.'))}>
          Baixar modelo em Excel
        </Botao>
      </Cartao>

      <Cartao className="space-y-3">
        <Rotulo>2. Envie a planilha preenchida</Rotulo>
        {ehGestao && (
          <Selecao rotulo="Quem vai cuidar destes leads" value={dono} onChange={(e) => setDono(e.target.value)}>
            <option value="">Escolha</option>
            {representantes.data?.filter((r) => r.ativo).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        )}
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => ler(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-marrom/30 file:bg-transparent file:px-4 file:font-semibold file:text-marrom"
        />
        {erro && <Aviso>{erro}</Aviso>}
      </Cartao>

      {(prontos.length > 0 || recusados.length > 0) && (
        <Cartao className="space-y-3">
          <Rotulo>3. Confira</Rotulo>
          <p className="text-sm">
            <strong>{prontos.length}</strong> {prontos.length === 1 ? 'lead pronto' : 'leads prontos'} para entrar.
            {recusados.length > 0 && ` ${recusados.length} ${recusados.length === 1 ? 'linha ficou' : 'linhas ficaram'} de fora.`}
          </p>
          {prontos.length > 0 && (
            <ul className="max-h-52 divide-y divide-linha overflow-y-auto rounded-xl border border-linha text-sm">
              {prontos.map((l, i) => (
                <li key={i} className="px-3 py-2">
                  <span className="font-semibold">{l.nome}</span>
                  <span className="block text-xs text-marrom/65">{[l.bairro, l.segmento, l.contato_nome, l.contato_telefone].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          )}
          {recusados.length > 0 && (
            <ul className="space-y-0.5 text-xs text-alerta">
              {recusados.slice(0, 12).map((r) => (
                <li key={r}>{r}</li>
              ))}
              {recusados.length > 12 && <li>e mais {recusados.length - 12}.</li>}
            </ul>
          )}
          <Aviso erro={importar.error} />
          <Botao cheio disabled={prontos.length === 0 || importar.isPending || (ehGestao && !dono)} onClick={enviar}>
            {importar.isPending ? 'Importando.' : `Importar ${prontos.length} ${prontos.length === 1 ? 'lead' : 'leads'}`}
          </Botao>
          {ehGestao && !dono && prontos.length > 0 && <p className="text-xs text-alerta">Escolha quem vai cuidar destes leads.</p>}
        </Cartao>
      )}

      {prospectos.data?.length === 0 && recusados.length === 0 && prontos.length === 0 && <Vazio>Ainda não há nenhum lead cadastrado.</Vazio>}

      <BotaoLink para="/crm" variante="discreto" cheio>
        Voltar ao CRM
      </BotaoLink>
    </div>
  )
}
