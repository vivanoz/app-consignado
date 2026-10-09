import { useState, type FormEvent } from 'react'
import { EnviarArquivo, Foto } from '../components/arquivos'
import { Aviso, Botao, BotaoLink, Campo, Cartao, Carregando, Rotulo, Selecao, Titulo, Vazio } from '../components/ui'
import { useAnexar, useEmpresa, usePrecos, useProdutos, useRepresentantes, useSalvarEmpresa, useSalvarPreco } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_MODALIDADE, NOME_PAPEL, data, hoje, precoVigente, reais } from '../lib/formato'
import { supabase } from '../lib/supabase'

export function Mais() {
  const { perfil, papel, ehGestao, meuRepresentanteId, visaoDe, sair } = useAcesso()
  const anexar = useAnexar()
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

      {ehGestao && <DadosDeCobranca />}

      {papel !== 'representante' && (
        <Cartao className="space-y-3">
          <Rotulo>Produção</Rotulo>
          <BotaoLink para="/mais/insumos" variante="secundario" cheio>
            Matérias-primas
          </BotaoLink>
          {ehGestao && (
            <>
              <BotaoLink para="/mais/produtos" variante="secundario" cheio>
                Produtos e receitas
              </BotaoLink>
              <BotaoLink para="/mais/fornecedores" variante="secundario" cheio>
                Fornecedores
              </BotaoLink>
            </>
          )}
        </Cartao>
      )}

      <Cartao>
        <Rotulo>Sua conta</Rotulo>
        <div className="mt-3 flex items-center gap-3">
          <FotoDoRepresentante id={meuRepresentanteId} nome={perfil?.nome ?? ''} />
          <div className="min-w-0">
            <p className="font-bold">{perfil?.nome}</p>
            <p className="truncate text-sm text-marrom/70">
              {visaoDe ? 'visão de teste' : perfil?.email} · {papel && NOME_PAPEL[papel]}
            </p>
          </div>
        </div>
        {meuRepresentanteId && (
          <div className="mt-2">
            <EnviarArquivo espaco="fotos" pasta="representantes" id={meuRepresentanteId} variante="discreto" aoEnviar={(path) => anexar.mutateAsync({ alvo: 'representante', id: meuRepresentanteId, path })}>
              Trocar minha foto
            </EnviarArquivo>
          </div>
        )}
        {visaoDe ? (
          <p className="mt-3 text-sm text-marrom/70">Na conta de {visaoDe.nome}, aqui fica a troca de senha.</p>
        ) : (
        <form onSubmit={trocarSenha} className="mt-4 space-y-3">
          <Campo rotulo="Nova senha (mínimo de 8 caracteres)" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} />
          <Aviso erro={erro} />
          {recado && <p className="text-sm text-verde">{recado}</p>}
          <Botao type="submit" variante="secundario" cheio>
            Trocar senha
          </Botao>
        </form>
        )}
      </Cartao>

      <Botao variante="secundario" cheio onClick={sair}>
        Sair
      </Botao>
    </div>
  )
}

// Chave Pix que vai no resumo da visita enviado às lojas.
function DadosDeCobranca() {
  const empresa = useEmpresa()
  const salvar = useSalvarEmpresa()
  const [form, setForm] = useState<{ pix_chave: string; pix_favorecido: string; pix_banco: string } | null>(null)
  const [salvo, setSalvo] = useState(false)

  if (empresa.isPending) return null
  const atual = form ?? { pix_chave: empresa.data?.pix_chave ?? '', pix_favorecido: empresa.data?.pix_favorecido ?? '', pix_banco: empresa.data?.pix_banco ?? '' }
  const mudar = (campo: keyof typeof atual) => (e: { target: { value: string } }) => {
    setSalvo(false)
    setForm({ ...atual, [campo]: e.target.value })
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      pix_chave: atual.pix_chave.trim() || null,
      pix_favorecido: atual.pix_favorecido.trim() || null,
      pix_banco: atual.pix_banco.trim() || null,
    })
    setSalvo(true)
  }

  return (
    <Cartao>
      <Rotulo>Pix para cobrança das lojas</Rotulo>
      <p className="mt-1 text-xs text-marrom/65">Aparece no resumo da visita que o app monta para enviar à loja.</p>
      {!empresa.data?.pix_chave && <p className="mt-2 text-sm font-semibold text-alerta">Sem chave cadastrada. O resumo sai sem a chave Pix.</p>}
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Campo rotulo="Chave Pix" value={atual.pix_chave} onChange={mudar('pix_chave')} />
        <Campo rotulo="Nome de quem recebe" value={atual.pix_favorecido} onChange={mudar('pix_favorecido')} />
        <Campo rotulo="Banco" placeholder="Opcional." value={atual.pix_banco} onChange={mudar('pix_banco')} />
        <Aviso erro={salvar.error} />
        {salvo && <p className="text-sm text-verde">Salvo.</p>}
        <Botao type="submit" variante="secundario" cheio disabled={salvar.isPending}>
          Salvar dados de cobrança
        </Botao>
      </form>
    </Cartao>
  )
}

function FotoDoRepresentante({ id, nome }: { id: string | null; nome: string }) {
  const representantes = useRepresentantes()
  return <Foto caminho={representantes.data?.find((r) => r.id === id)?.foto_path} nome={nome} className="size-14 shrink-0" />
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
      modalidade: form.modalidade as 'consignado' | 'compra_direta' | 'varejo',
      preco_loja: numero(form.preco_loja),
      preco_sugerido: form.preco_sugerido ? numero(form.preco_sugerido) : null,
      vigente_desde: form.vigente_desde,
    })
    setForm((f) => ({ ...f, preco_loja: '', preco_sugerido: '' }))
  }

  return (
    <div className="space-y-4">
      <Titulo apoio="Preço por pacote. O Kit Teste usa o preço do consignado. Varejo é o preço médio da venda na rua.">Preços</Titulo>

      <Cartao>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-marrom/60 uppercase">
              <th className="pb-1 font-semibold">Hoje</th>
              <th className="pb-1 text-right font-semibold">Consignado</th>
              <th className="pb-1 text-right font-semibold">Direta</th>
              <th className="pb-1 text-right font-semibold">Varejo</th>
            </tr>
          </thead>
          <tbody>
            {produtos.data?.map((p) => {
              const consignado = precoVigente(precos.data ?? [], p.id, 'consignado')
              const direta = precoVigente(precos.data ?? [], p.id, 'compra_direta')
              const varejo = precoVigente(precos.data ?? [], p.id, 'varejo')
              return (
                <tr key={p.id} className="border-t border-linha">
                  <td className="py-2">{p.nome_curto}</td>
                  <td className="py-2 text-right font-bold">{consignado ? reais(consignado.preco_loja) : 'sem preço'}</td>
                  <td className="py-2 text-right font-bold">{direta ? reais(direta.preco_loja) : 'sem preço'}</td>
                  <td className="py-2 text-right font-bold">{varejo ? reais(varejo.preco_loja) : 'sem preço'}</td>
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
            <option value="varejo">{NOME_MODALIDADE.varejo} (preço médio na rua)</option>
          </Selecao>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Preço (R$)" inputMode="decimal" required pattern="\d+([.,]\d{1,2})?" placeholder="12,90" value={form.preco_loja} onChange={(e) => setForm({ ...form, preco_loja: e.target.value })} />
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
