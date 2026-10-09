import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAtividades, useLojas, useProspectos, useRepresentantes, useSalvarAtividade } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { daquiA, prazo, quando } from '../lib/crm'
import { data, hoje } from '../lib/formato'
import type { Atividade } from '../lib/tipos'
import { Aviso, Botao, Campo, Cartao, Carregando, Etiqueta, Rotulo, Selecao, Vazio } from './ui'

const GRUPOS = [
  { id: 'atrasada', nome: 'Atrasadas' },
  { id: 'hoje', nome: 'Para hoje' },
  { id: 'semana', nome: 'Próximos 7 dias' },
  { id: 'depois', nome: 'Mais adiante' },
] as const

// Lembretes do que precisa ser feito. Sem "de", mostra tudo o que a pessoa
// enxerga; com "de", só os de um cliente ou de um lead.
export function Atividades({ de, compacto = false }: { de?: { lojaId?: string; prospectoId?: string }; compacto?: boolean }) {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const atividades = useAtividades()
  const lojas = useLojas()
  const prospectos = useProspectos()
  const representantes = useRepresentantes()
  const [criando, setCriando] = useState(false)
  const [quem, setQuem] = useState<'minhas' | 'todas'>('minhas')

  if (atividades.isPending) return <Carregando />
  if (atividades.error) return <Aviso erro={atividades.error} />

  const doContexto = atividades.data.filter((a) => (de?.lojaId ? a.loja_id === de.lojaId : de?.prospectoId ? a.prospecto_id === de.prospectoId : true))
  // Na lista geral, a gestão que também visita começa vendo só as suas.
  const filtraMinhas = !de && ehGestao && meuRepresentanteId && quem === 'minhas'
  const abertas = doContexto.filter((a) => !a.concluida_em && (!filtraMinhas || a.representante_id === meuRepresentanteId))
  const feitas = doContexto.filter((a) => a.concluida_em).slice(0, 5)

  const alvo = (a: Atividade) => {
    const loja = lojas.data?.find((l) => l.id === a.loja_id)
    const lead = prospectos.data?.find((p) => p.id === a.prospecto_id)
    return loja ? { nome: loja.nome, para: `/lojas/${loja.id}`, tipo: 'Cliente' } : lead ? { nome: lead.nome, para: `/crm/${lead.id}`, tipo: 'Lead' } : null
  }
  const nomeRep = (id: string) => representantes.data?.find((r) => r.id === id)?.nome

  return (
    <div className="space-y-3">
      {!de && ehGestao && meuRepresentanteId && (
        <div className="flex gap-4 text-sm font-semibold">
          {(['minhas', 'todas'] as const).map((q) => (
            <button key={q} type="button" onClick={() => setQuem(q)} className={quem === q ? 'text-verde underline underline-offset-4' : 'text-marrom/60'}>
              {q === 'minhas' ? 'As minhas' : 'De toda a equipe'}
            </button>
          ))}
        </div>
      )}

      {criando ? (
        <NovaAtividade de={de} aoFechar={() => setCriando(false)} />
      ) : (
        <Botao variante={compacto ? 'secundario' : 'primario'} cheio onClick={() => setCriando(true)}>
          Novo lembrete
        </Botao>
      )}

      {abertas.length === 0 && <Vazio>{de ? 'Nenhum lembrete aberto aqui.' : 'Nada pendente. Tudo em dia.'}</Vazio>}

      {GRUPOS.map((g) => {
        const doGrupo = abertas.filter((a) => prazo(a.vence_em) === g.id)
        if (doGrupo.length === 0) return null
        return (
          <section key={g.id} className="space-y-2">
            <p className={`text-[11px] font-bold tracking-[0.14em] uppercase ${g.id === 'atrasada' ? 'text-alerta' : 'text-verde'}`}>
              {g.nome} · {doGrupo.length}
            </p>
            {doGrupo.map((a) => (
              <CartaoAtividade key={a.id} atividade={a} alvo={de ? null : alvo(a)} responsavel={ehGestao && a.representante_id !== meuRepresentanteId ? nomeRep(a.representante_id) : undefined} />
            ))}
          </section>
        )
      })}

      {feitas.length > 0 && !compacto && (
        <section className="space-y-1.5">
          <Rotulo>Concluídas recentemente</Rotulo>
          {feitas.map((a) => (
            <p key={a.id} className="text-sm text-marrom/60 line-through">
              {a.titulo}
              {!de && alvo(a) ? ` · ${alvo(a)!.nome}` : ''}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}

function CartaoAtividade({ atividade: a, alvo, responsavel }: { atividade: Atividade; alvo: { nome: string; para: string; tipo: string } | null; responsavel?: string }) {
  const { perfil } = useAcesso()
  const salvar = useSalvarAtividade()
  const [adiando, setAdiando] = useState(false)
  const atrasada = prazo(a.vence_em) === 'atrasada'

  return (
    <Cartao className={`py-3 ${atrasada ? 'border-alerta/40' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={`Concluir: ${a.titulo}`}
          disabled={salvar.isPending}
          onClick={() => salvar.mutate({ id: a.id, concluida_em: new Date().toISOString(), concluida_por: perfil?.id ?? null })}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 border-verde text-verde active:bg-verde active:text-creme"
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <p className="leading-snug font-bold">{a.titulo}</p>
          {alvo && (
            <Link to={alvo.para} className="text-sm font-semibold text-verde underline decoration-linha underline-offset-4">
              {alvo.nome}
            </Link>
          )}
          {a.descricao && <p className="mt-0.5 text-sm whitespace-pre-line text-marrom/75">{a.descricao}</p>}
          <p className={`mt-1 text-xs ${atrasada ? 'font-semibold text-alerta' : 'text-marrom/65'}`}>
            {data(a.vence_em)} · {quando(a.vence_em)}
            {responsavel ? ` · ${responsavel}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {alvo && <Etiqueta>{alvo.tipo}</Etiqueta>}
          {a.tipo === 'reposicao' && <Etiqueta tom="ouro">Reposição</Etiqueta>}
        </div>
      </div>

      {adiando ? (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-linha pt-2">
          {[1, 3, 7, 15].map((dias) => (
            <button
              key={dias}
              type="button"
              disabled={salvar.isPending}
              onClick={() => salvar.mutateAsync({ id: a.id, vence_em: daquiA(dias) }).then(() => setAdiando(false))}
              className="min-h-10 rounded-full border border-marrom/30 px-4 text-sm font-semibold"
            >
              {dias === 1 ? 'Amanhã' : `Em ${dias} dias`}
            </button>
          ))}
          <button type="button" onClick={() => setAdiando(false)} className="min-h-10 px-2 text-sm text-marrom/60">
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdiando(true)} className="mt-1 ml-11 min-h-9 text-sm font-semibold text-verde underline underline-offset-4">
          Adiar
        </button>
      )}
      <Aviso erro={salvar.error} />
    </Cartao>
  )
}

function NovaAtividade({ de, aoFechar }: { de?: { lojaId?: string; prospectoId?: string }; aoFechar: () => void }) {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const representantes = useRepresentantes()
  const lojas = useLojas()
  const prospectos = useProspectos()
  const salvar = useSalvarAtividade()
  // O responsável padrão é quem cuida do cliente ou do lead; fora disso, quem está criando.
  const dono = lojas.data?.find((l) => l.id === de?.lojaId)?.representante_id ?? prospectos.data?.find((p) => p.id === de?.prospectoId)?.representante_id ?? meuRepresentanteId ?? ''
  const [form, setForm] = useState({ titulo: '', descricao: '', vence_em: daquiA(1), representante_id: dono })

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      vence_em: form.vence_em,
      representante_id: ehGestao ? form.representante_id : (meuRepresentanteId ?? form.representante_id),
      loja_id: de?.lojaId ?? null,
      prospecto_id: de?.prospectoId ?? null,
    })
    aoFechar()
  }

  return (
    <Cartao>
      <Rotulo>Novo lembrete</Rotulo>
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Campo rotulo="O que precisa ser feito" required placeholder="Levar expositor novo." value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
        <Campo rotulo="Detalhe" placeholder="Opcional." value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        <Campo rotulo="Para quando" type="date" required min={hoje()} value={form.vence_em} onChange={(e) => setForm({ ...form, vence_em: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 7, 15].map((dias) => (
            <button key={dias} type="button" onClick={() => setForm({ ...form, vence_em: daquiA(dias) })} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${form.vence_em === daquiA(dias) ? 'border-verde bg-verde text-creme' : 'border-marrom/30'}`}>
              {dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : `Em ${dias} dias`}
            </button>
          ))}
        </div>
        {ehGestao && (
          <Selecao rotulo="Quem faz" required value={form.representante_id} onChange={(e) => setForm({ ...form, representante_id: e.target.value })}>
            <option value="">Escolha</option>
            {representantes.data?.filter((r) => r.ativo).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Selecao>
        )}
        <Aviso erro={salvar.error} />
        <Botao type="submit" cheio disabled={salvar.isPending}>
          Salvar lembrete
        </Botao>
        <Botao variante="discreto" cheio onClick={aoFechar}>
          Cancelar
        </Botao>
      </form>
    </Cartao>
  )
}
