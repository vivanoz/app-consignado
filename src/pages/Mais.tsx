import { useState, type FormEvent } from 'react'
import { Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, Etiqueta, Rotulo, Selecao, Titulo, Vazio } from '../components/ui'
import { usePerfis, usePrecos, useProdutos, useRepresentantes, useSalvarPerfil, useSalvarPreco, useSalvarRepresentante } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_MODALIDADE, NOME_PAPEL, data, hoje, precoVigente, reais } from '../lib/formato'
import { supabase } from '../lib/supabase'
import type { Papel } from '../lib/tipos'

export function Mais() {
  const { perfil, papel, ehGestao, sair } = useAcesso()
  const [senha, setSenha] = useState('')
  const [recado, setRecado] = useState('')
  const [erro, setErro] = useState<unknown>(null)

  async function trocarSenha(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setRecado('')
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) return setErro(error)
    setSenha('')
    setRecado('Senha alterada.')
  }

  return (
    <div className="space-y-4">
      <Titulo>Mais</Titulo>

      {ehGestao && (
        <Cartao className="space-y-3">
          <Rotulo>Gestão</Rotulo>
          <BotaoLink para="/mais/precos" variante="secundario" cheio>
            Tabela de preços
          </BotaoLink>
          <BotaoLink para="/mais/equipe" variante="secundario" cheio>
            Equipe e acessos
          </BotaoLink>
        </Cartao>
      )}

      <Cartao>
        <Rotulo>Sua conta</Rotulo>
        <p className="mt-2 font-bold">{perfil?.nome}</p>
        <p className="text-sm text-marrom/70">
          {perfil?.email} · {papel && NOME_PAPEL[papel]}
        </p>
        <form onSubmit={trocarSenha} className="mt-4 space-y-3">
          <Campo rotulo="Nova senha (mínimo de 8 caracteres)" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} />
          <Aviso erro={erro} />
          {recado && <p className="text-sm text-verde">{recado}</p>}
          <Botao type="submit" variante="secundario" cheio>
            Trocar senha
          </Botao>
        </form>
      </Cartao>

      <Botao variante="secundario" cheio onClick={sair}>
        Sair
      </Botao>
    </div>
  )
}

export function Precos() {
  const produtos = useProdutos()
  const precos = usePrecos()
  const salvar = useSalvarPreco()
  const [form, setForm] = useState({ produto_id: '', modalidade: 'consignado', preco_loja: '', preco_sugerido: '', vigente_desde: hoje() })

  if (produtos.isPending || precos.isPending) return <Carregando />

  const numero = (texto: string) => Number(texto.replace(',', '.'))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      produto_id: form.produto_id,
      modalidade: form.modalidade as 'consignado' | 'compra_direta',
      preco_loja: numero(form.preco_loja),
      preco_sugerido: form.preco_sugerido ? numero(form.preco_sugerido) : null,
      vigente_desde: form.vigente_desde,
    })
    setForm((f) => ({ ...f, preco_loja: '', preco_sugerido: '' }))
  }

  return (
    <div className="space-y-4">
      <Titulo apoio="Preço que a loja paga por pacote. O Kit Teste usa o preço do consignado.">Preços</Titulo>

      <Cartao>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-marrom/60 uppercase">
              <th className="pb-1 font-semibold">Hoje</th>
              <th className="pb-1 text-right font-semibold">Consignado</th>
              <th className="pb-1 text-right font-semibold">Direta</th>
            </tr>
          </thead>
          <tbody>
            {produtos.data?.map((p) => {
              const consignado = precoVigente(precos.data ?? [], p.id, 'consignado')
              const direta = precoVigente(precos.data ?? [], p.id, 'compra_direta')
              return (
                <tr key={p.id} className="border-t border-linha">
                  <td className="py-2">{p.nome_curto}</td>
                  <td className="py-2 text-right font-bold">{consignado ? reais(consignado.preco_loja) : 'sem preço'}</td>
                  <td className="py-2 text-right font-bold">{direta ? reais(direta.preco_loja) : 'sem preço'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Cartao>

      <Cartao>
        <Rotulo>Novo preço</Rotulo>
        <p className="mt-1 text-xs text-marrom/65">Um preço lançado não se edita. Para mudar, lance outro com a data em que passa a valer. Acertos já gerados mantêm o preço antigo.</p>
        <form onSubmit={enviar} className="mt-3 space-y-3">
          <Selecao rotulo="Produto" required value={form.produto_id} onChange={(e) => setForm({ ...form, produto_id: e.target.value })}>
            <option value="">Escolha</option>
            {produtos.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Modalidade" value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value })}>
            <option value="consignado">{NOME_MODALIDADE.consignado} e Kit Teste</option>
            <option value="compra_direta">{NOME_MODALIDADE.compra_direta}</option>
          </Selecao>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Loja paga (R$)" inputMode="decimal" required pattern="\d+([.,]\d{1,2})?" placeholder="12,90" value={form.preco_loja} onChange={(e) => setForm({ ...form, preco_loja: e.target.value })} />
            <Campo rotulo="Sugerido (R$)" inputMode="decimal" pattern="\d+([.,]\d{1,2})?" placeholder="16,90" value={form.preco_sugerido} onChange={(e) => setForm({ ...form, preco_sugerido: e.target.value })} />
          </div>
          <Campo rotulo="Vale a partir de" type="date" required value={form.vigente_desde} onChange={(e) => setForm({ ...form, vigente_desde: e.target.value })} />
          <Aviso erro={salvar.error} />
          <Botao type="submit" cheio disabled={salvar.isPending}>
            Lançar preço
          </Botao>
        </form>
      </Cartao>

      <section className="space-y-2">
        <Rotulo>Histórico</Rotulo>
        {precos.data?.length === 0 && <Vazio>Nenhum preço lançado. Sem preço, o app não deixa gravar visita com venda.</Vazio>}
        {precos.data && precos.data.length > 0 && (
          <Cartao className="divide-y divide-linha py-1">
            {precos.data.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {produtos.data?.find((x) => x.id === p.produto_id)?.nome_curto} · {NOME_MODALIDADE[p.modalidade]}
                  <span className="block text-xs text-marrom/60">desde {data(p.vigente_desde)}</span>
                </span>
                <strong>{reais(p.preco_loja)}</strong>
              </div>
            ))}
          </Cartao>
        )}
      </section>
    </div>
  )
}

export function Equipe() {
  const { perfil: eu } = useAcesso()
  const perfis = usePerfis()
  const representantes = useRepresentantes()
  const salvarPerfil = useSalvarPerfil()
  const salvarRepresentante = useSalvarRepresentante()
  const [novo, setNovo] = useState({ nome: '', telefone: '', perfil_id: '' })

  if (perfis.isPending || representantes.isPending) return <Carregando />

  const semVinculo = perfis.data?.filter((p) => !representantes.data?.some((r) => r.perfil_id === p.id)) ?? []

  async function criarRepresentante(e: FormEvent) {
    e.preventDefault()
    await salvarRepresentante.mutateAsync({
      nome: novo.nome.trim(),
      telefone: novo.telefone.trim() || null,
      perfil_id: novo.perfil_id || null,
      territorio: 'Maringá · arenas de jogos de praia',
    })
    setNovo({ nome: '', telefone: '', perfil_id: '' })
  }

  return (
    <div className="space-y-4">
      <Titulo apoio="Quem entra no app e o que cada pessoa enxerga.">Equipe</Titulo>

      <section className="space-y-2.5">
        <Rotulo>Acessos</Rotulo>
        <Aviso erro={salvarPerfil.error} />
        {perfis.data?.map((p) => (
          <Cartao key={p.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold">{p.nome}</p>
                <p className="truncate text-xs text-marrom/65">{p.email}</p>
              </div>
              <Etiqueta tom={p.ativo ? 'verde' : 'ouro'}>{p.ativo ? 'Ativo' : 'Aguardando'}</Etiqueta>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
              <Selecao
                rotulo="Perfil"
                value={p.papel}
                disabled={p.id === eu?.id}
                onChange={(e) => salvarPerfil.mutate({ id: p.id, papel: e.target.value as Papel })}
              >
                {(Object.keys(NOME_PAPEL) as Papel[]).map((papel) => (
                  <option key={papel} value={papel}>
                    {NOME_PAPEL[papel]}
                  </option>
                ))}
              </Selecao>
              {p.id !== eu?.id && (
                <Botao variante={p.ativo ? 'secundario' : 'primario'} onClick={() => salvarPerfil.mutate({ id: p.id, ativo: !p.ativo })}>
                  {p.ativo ? 'Bloquear' : 'Liberar'}
                </Botao>
              )}
            </div>
          </Cartao>
        ))}
        <p className="text-xs text-marrom/65">
          Para incluir uma pessoa, convide o e-mail dela no painel do Supabase (Authentication, Users, Invite). Ela aparece aqui como "Aguardando" até você escolher o perfil e liberar.
        </p>
      </section>

      <section className="space-y-2.5">
        <Rotulo>Representantes</Rotulo>
        <Aviso erro={salvarRepresentante.error} />
        {representantes.data?.length === 0 && <Vazio>Nenhum representante. Cadastre quem faz as visitas, inclusive quem é da gestão.</Vazio>}
        {representantes.data?.map((r) => (
          <Cartao key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{r.nome}</p>
                <p className="text-xs text-marrom/65">{[r.telefone, r.territorio].filter(Boolean).join(' · ')}</p>
              </div>
              <Botao variante="discreto" onClick={() => salvarRepresentante.mutate({ id: r.id, ativo: !r.ativo })}>
                {r.ativo ? 'Desativar' : 'Reativar'}
              </Botao>
            </div>
            <div className="mt-2">
              <Selecao rotulo="Entra no app como" value={r.perfil_id ?? ''} onChange={(e) => salvarRepresentante.mutate({ id: r.id, perfil_id: e.target.value || null })}>
                <option value="">Sem acesso ao app</option>
                {perfis.data?.filter((p) => p.id === r.perfil_id || semVinculo.includes(p)).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.email})
                  </option>
                ))}
              </Selecao>
            </div>
          </Cartao>
        ))}

        <Cartao>
          <Rotulo>Novo representante</Rotulo>
          <form onSubmit={criarRepresentante} className="mt-3 space-y-3">
            <Campo rotulo="Nome" required value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <Campo rotulo="WhatsApp" type="tel" inputMode="tel" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
            <Selecao rotulo="Entra no app como" value={novo.perfil_id} onChange={(e) => setNovo({ ...novo, perfil_id: e.target.value })}>
              <option value="">Sem acesso ao app por enquanto</option>
              {semVinculo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.email})
                </option>
              ))}
            </Selecao>
            <Botao type="submit" cheio disabled={salvarRepresentante.isPending}>
              Cadastrar representante
            </Botao>
          </form>
        </Cartao>
      </section>
    </div>
  )
}
