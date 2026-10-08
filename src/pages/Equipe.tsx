import { useState, type FormEvent } from 'react'
import { EnviarArquivo, Foto } from '../components/arquivos'
import { Aviso, Botao, Campo, Cartao, Carregando, Etiqueta, Rotulo, Selecao, Titulo } from '../components/ui'
import {
  useAnexar,
  useCondicoes,
  useCriarUsuario,
  usePerfis,
  useRepresentantes,
  useSalvarCondicao,
  useSalvarPerfil,
  useSalvarRepresentante,
} from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_PAPEL, hoje, porcento, reais } from '../lib/formato'
import type { Condicao, Papel, Perfil, Representante } from '../lib/tipos'

const numero = (texto: string) => Number(String(texto).replace(',', '.')) || 0

// Senha provisória fácil de ditar: sem letras e números que se confundem.
function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789'
  const sorteio = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(sorteio, (n) => letras[n % letras.length]).join('')
}

export function Equipe() {
  const { perfil: eu } = useAcesso()
  const perfis = usePerfis()
  const representantes = useRepresentantes()
  const condicoes = useCondicoes()
  const [criando, setCriando] = useState(false)

  if (perfis.isPending || representantes.isPending) return <Carregando />

  const aguardando = perfis.data?.filter((p) => !p.ativo) ?? []
  const ativos = perfis.data?.filter((p) => p.ativo) ?? []

  const cartao = (p: Perfil) => {
    const rep = representantes.data?.find((r) => r.perfil_id === p.id)
    return <Pessoa key={p.id} perfil={p} representante={rep} condicao={condicoes.data?.find((c) => c.representante_id === rep?.id)} souEu={p.id === eu?.id} />
  }

  return (
    <div className="space-y-5">
      <Titulo apoio="Quem entra no app e o que cada pessoa enxerga.">Equipe</Titulo>

      {criando ? (
        <NovoUsuario aoFechar={() => setCriando(false)} />
      ) : (
        <Botao cheio onClick={() => setCriando(true)}>
          Cadastrar nova pessoa
        </Botao>
      )}

      {aguardando.length > 0 && (
        <section className="space-y-2.5">
          <Rotulo>Aguardando liberação</Rotulo>
          <p className="text-xs text-marrom/65">Criaram a conta sozinhas em "Primeiro acesso". Libere só quem você reconhece.</p>
          {aguardando.map(cartao)}
        </section>
      )}

      <section className="space-y-2.5">
        <Rotulo>Pessoas com acesso</Rotulo>
        {ativos.map(cartao)}
      </section>

      <Cartao>
        <Rotulo>O que cada perfil vê</Rotulo>
        <ul className="mt-2 space-y-1.5 text-sm text-marrom/80">
          <li><strong>Gestão:</strong> tudo. Preços, equipe, Pix das lojas, pagamento de comissões.</li>
          <li><strong>Representante:</strong> suas lojas, seu estoque, suas visitas e suas comissões.</li>
          <li><strong>Produção:</strong> estoque dos representantes, retirada e devolução.</li>
        </ul>
      </Cartao>
    </div>
  )
}

function NovoUsuario({ aoFechar }: { aoFechar: () => void }) {
  const criar = useCriarUsuario()
  const [form, setForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    senha: gerarSenha(),
    papel: 'representante' as Papel,
    fazVisitas: false,
    consignado: '15',
    direta: '12',
    bonus: '30',
  })
  const [criado, setCriado] = useState<{ nome: string; email: string; senha: string } | null>(null)

  const campo = (nome: keyof typeof form) => ({
    value: String(form[nome]),
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [nome]: e.target.value })),
  })
  const visita = form.papel === 'representante' || (form.papel === 'gestao' && form.fazVisitas)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await criar.mutateAsync({
      nome: form.nome.trim(),
      email: form.email.trim(),
      telefone: form.telefone.trim(),
      senha: form.senha,
      papel: form.papel,
      faz_visitas: visita,
      comissao_consignado: numero(form.consignado) / 100,
      comissao_direta: numero(form.direta) / 100,
      bonus_abertura: numero(form.bonus),
    })
    setCriado({ nome: form.nome.trim(), email: form.email.trim(), senha: form.senha })
  }

  if (criado) {
    return (
      <Cartao className="space-y-3 border-verde/40 bg-verde/8">
        <p className="font-serif text-2xl font-semibold">Acesso criado.</p>
        <p className="text-sm">Passe estes dados para {criado.nome.split(' ')[0]}. A senha é provisória: a pessoa troca em Mais, na primeira vez que entrar.</p>
        <dl className="space-y-1 rounded-xl bg-papel p-3 text-sm">
          <div><dt className="inline font-semibold">Endereço: </dt><dd className="inline break-all">{window.location.origin + window.location.pathname}</dd></div>
          <div><dt className="inline font-semibold">E-mail: </dt><dd className="inline break-all">{criado.email}</dd></div>
          <div><dt className="inline font-semibold">Senha provisória: </dt><dd className="inline font-mono">{criado.senha}</dd></div>
        </dl>
        <p className="text-xs text-marrom/65">Anote agora. Esta senha não aparece de novo.</p>
        <Botao cheio onClick={aoFechar}>
          Pronto
        </Botao>
      </Cartao>
    )
  }

  return (
    <Cartao>
      <Rotulo>Nova pessoa</Rotulo>
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Campo rotulo="Nome" required {...campo('nome')} />
        <Campo rotulo="E-mail (será o login)" type="email" required {...campo('email')} />
        <Campo rotulo="WhatsApp" type="tel" inputMode="tel" {...campo('telefone')} />
        <Selecao rotulo="Perfil" {...campo('papel')}>
          {(Object.keys(NOME_PAPEL) as Papel[]).map((papel) => (
            <option key={papel} value={papel}>
              {NOME_PAPEL[papel]}
            </option>
          ))}
        </Selecao>

        {form.papel === 'gestao' && (
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={form.fazVisitas} onChange={(e) => setForm((f) => ({ ...f, fazVisitas: e.target.checked }))} className="size-5 accent-[#455020]" />
            Também faz visitas e reposição
          </label>
        )}

        {visita && (
          <div className="rounded-xl bg-creme p-3">
            <p className="text-sm font-semibold">Comissão</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Campo rotulo="Consignado %" inputMode="decimal" {...campo('consignado')} />
              <Campo rotulo="Direta %" inputMode="decimal" {...campo('direta')} />
              <Campo rotulo="Bônus R$" inputMode="decimal" {...campo('bonus')} />
            </div>
            <p className="mt-2 text-xs text-marrom/65">Para quem é da casa e não recebe comissão, deixe tudo em zero.</p>
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Campo rotulo="Senha provisória (mínimo de 8)" minLength={8} required autoComplete="off" {...campo('senha')} />
          <Botao variante="secundario" onClick={() => setForm((f) => ({ ...f, senha: gerarSenha() }))}>
            Outra
          </Botao>
        </div>

        <Aviso erro={criar.error} />
        <Botao type="submit" cheio disabled={criar.isPending}>
          {criar.isPending ? 'Criando.' : 'Criar acesso'}
        </Botao>
        <Botao variante="discreto" cheio onClick={aoFechar}>
          Cancelar
        </Botao>
      </form>
    </Cartao>
  )
}

function Pessoa({ perfil, representante, condicao, souEu }: { perfil: Perfil; representante?: Representante; condicao?: Condicao; souEu: boolean }) {
  const salvarPerfil = useSalvarPerfil()
  const salvarRepresentante = useSalvarRepresentante()
  const salvarCondicao = useSalvarCondicao()
  const anexar = useAnexar()
  const [editando, setEditando] = useState(false)
  const [taxa, setTaxa] = useState({ consignado: '', direta: '', bonus: '' })

  function abrirComissao() {
    setTaxa({
      consignado: String(Number(condicao?.comissao_consignado ?? 0.15) * 100),
      direta: String(Number(condicao?.comissao_direta ?? 0.12) * 100),
      bonus: String(Number(condicao?.bonus_abertura ?? 30)),
    })
    setEditando(true)
  }

  async function gravarComissao(e: FormEvent) {
    e.preventDefault()
    await salvarCondicao.mutateAsync({
      representante_id: representante!.id,
      comissao_consignado: numero(taxa.consignado) / 100,
      comissao_direta: numero(taxa.direta) / 100,
      bonus_abertura: numero(taxa.bonus),
      vigente_desde: hoje(),
    })
    setEditando(false)
  }

  const erro = salvarPerfil.error ?? salvarRepresentante.error ?? salvarCondicao.error

  return (
    <Cartao>
      <div className="flex items-center gap-3">
        <Foto caminho={representante?.foto_path} nome={perfil.nome} className="size-12 shrink-0 text-base" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {perfil.nome}
            {souEu && <span className="font-normal text-marrom/60"> (você)</span>}
          </p>
          <p className="truncate text-xs text-marrom/65">{perfil.email}</p>
        </div>
        <Etiqueta tom={perfil.ativo ? 'verde' : 'ouro'}>{perfil.ativo ? NOME_PAPEL[perfil.papel] : 'Aguardando'}</Etiqueta>
      </div>

      {!souEu && (
        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
          <Selecao rotulo="Perfil" value={perfil.papel} onChange={(e) => salvarPerfil.mutate({ id: perfil.id, papel: e.target.value as Papel })}>
            {(Object.keys(NOME_PAPEL) as Papel[]).map((papel) => (
              <option key={papel} value={papel}>
                {NOME_PAPEL[papel]}
              </option>
            ))}
          </Selecao>
          <Botao variante={perfil.ativo ? 'secundario' : 'primario'} onClick={() => salvarPerfil.mutate({ id: perfil.id, ativo: !perfil.ativo })}>
            {perfil.ativo ? 'Bloquear' : 'Liberar'}
          </Botao>
        </div>
      )}

      {/* Parte de quem faz visitas: comissão, foto e situação. */}
      {representante ? (
        <div className="mt-3 space-y-2 border-t border-linha pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-semibold">{representante.ativo ? 'Faz visitas.' : 'Visitas desativadas.'}</span>{' '}
              {condicao
                ? `${porcento(condicao.comissao_consignado)} consignado · ${porcento(condicao.comissao_direta)} direta · bônus ${reais(condicao.bonus_abertura)}`
                : 'Sem comissão definida.'}
            </p>
          </div>
          {editando ? (
            <form onSubmit={gravarComissao} className="space-y-2 rounded-xl bg-creme p-3">
              <div className="grid grid-cols-3 gap-2">
                <Campo rotulo="Consignado %" inputMode="decimal" value={taxa.consignado} onChange={(e) => setTaxa({ ...taxa, consignado: e.target.value })} />
                <Campo rotulo="Direta %" inputMode="decimal" value={taxa.direta} onChange={(e) => setTaxa({ ...taxa, direta: e.target.value })} />
                <Campo rotulo="Bônus R$" inputMode="decimal" value={taxa.bonus} onChange={(e) => setTaxa({ ...taxa, bonus: e.target.value })} />
              </div>
              <p className="text-xs text-marrom/65">Vale para Pix confirmados de hoje em diante. Comissões já geradas não mudam.</p>
              <div className="grid grid-cols-2 gap-2">
                <Botao type="submit" disabled={salvarCondicao.isPending}>
                  Gravar
                </Botao>
                <Botao variante="secundario" onClick={() => setEditando(false)}>
                  Cancelar
                </Botao>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-x-5">
              <Botao variante="discreto" onClick={abrirComissao}>
                Alterar comissão
              </Botao>
              <EnviarArquivo espaco="fotos" pasta="representantes" id={representante.id} variante="discreto" aoEnviar={(path) => anexar.mutateAsync({ alvo: 'representante', id: representante.id, path })}>
                {representante.foto_path ? 'Trocar foto' : 'Adicionar foto'}
              </EnviarArquivo>
              <Botao variante="discreto" onClick={() => salvarRepresentante.mutate({ id: representante.id, ativo: !representante.ativo })}>
                {representante.ativo ? 'Parar visitas' : 'Voltar às visitas'}
              </Botao>
            </div>
          )}
        </div>
      ) : (
        perfil.ativo &&
        perfil.papel !== 'producao' && (
          <div className="mt-2 border-t border-linha pt-2">
            <Botao
              variante="discreto"
              disabled={salvarRepresentante.isPending}
              onClick={() =>
                salvarRepresentante.mutate({
                  nome: perfil.nome,
                  telefone: perfil.telefone,
                  perfil_id: perfil.id,
                  territorio: 'Maringá',
                  // Quem é da gestão começa sem comissão; dá para alterar depois.
                  condicao: perfil.papel === 'gestao' ? { comissao_consignado: 0, comissao_direta: 0, bonus_abertura: 0 } : undefined,
                })
              }
            >
              Passar a fazer visitas e reposição
            </Botao>
          </div>
        )
      )}

      <Aviso erro={erro} />
    </Cartao>
  )
}
