import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AreaDeTexto, Aviso, Botao, BotaoLink, Cartao, Carregando, Contador, Rotulo, Titulo, Vazio } from '../components/ui'
import { useAnexar, useLoja, usePrecos, useProdutos, useProdutosFora, useRegistrarVisita, useRepresentantes, useSaldosLoja, useSaldosRepresentante } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { useEstoqueDeQuemVende } from '../lib/estoque'
import { pacotes, precoVigente, reais } from '../lib/formato'
import { ResumoVisita } from '../components/ResumoVisita'
import { enviarArquivo } from '../lib/arquivos'
import type { ItemVisitaEnvio, ResultadoVisita } from '../lib/tipos'

type Linha = Omit<ItemVisitaEnvio, 'produto_id'>

interface Rascunho {
  // Identificador da visita, criado no aparelho. Reenviar com o mesmo
  // identificador não duplica o lançamento no banco.
  id: string
  linhas: Record<string, Linha>
  observacoes: string
}

const chave = (lojaId: string) => `vivanoz:visita:${lojaId}`

function lerRascunho(lojaId: string): Rascunho {
  try {
    const salvo = localStorage.getItem(chave(lojaId))
    if (salvo) return JSON.parse(salvo)
  } catch {
    // rascunho ilegível: começa do zero
  }
  return { id: crypto.randomUUID(), linhas: {}, observacoes: '' }
}

export function NovaVisita() {
  const { id: lojaId = '' } = useParams()
  const loja = useLoja(lojaId)
  const produtos = useProdutos()
  const precos = usePrecos()
  const saldosLoja = useSaldosLoja()
  const saldosRep = useSaldosRepresentante()
  const fora = useProdutosFora()
  const representantes = useRepresentantes()
  const { papel, meuRepresentanteId } = useAcesso()
  const registrar = useRegistrarVisita()
  const anexar = useAnexar()
  const [foto, setFoto] = useState<File | null>(null)
  const [avisoFoto, setAvisoFoto] = useState('')

  const [rascunho, setRascunho] = useState<Rascunho>(() => lerRascunho(lojaId))
  const [conferindo, setConferindo] = useState(false)
  // Resultado e resumo ficam guardados como foram gravados: depois do envio
  // os saldos recarregam e as linhas da tela já refletem a visita seguinte.
  const [resultado, setResultado] = useState<(ResultadoVisita & { resumo: string[] }) | null>(null)

  // O rascunho fica no aparelho: fechar o app ou perder o sinal no meio da
  // visita não apaga o que já foi contado.
  useEffect(() => {
    if (!resultado) localStorage.setItem(chave(lojaId), JSON.stringify(rascunho))
  }, [rascunho, lojaId, resultado])

  const l = loja.data
  const estoque = useEstoqueDeQuemVende(l?.representante_id)
  const [erroRetirada, setErroRetirada] = useState<unknown>(null)
  const direta = l?.modalidade === 'compra_direta'

  const linhas = useMemo(() => {
    if (!l || !produtos.data || !saldosLoja.data || !saldosRep.data) return []
    return produtos.data
      .map((p) => {
        const naLoja = saldosLoja.data.find((s) => s.loja_id === l.id && s.produto_id === p.id)?.saldo ?? 0
        // Em mãos e, para quem é da gestão e também vende, o que está na fábrica.
        const comigo = estoque.disponivel(p.id)
        // Sem contagem digitada, parte do saldo anterior (nada vendido).
        const padrao: Linha = { encontrado: direta ? 0 : naLoja, recolhido: 0, baixado: 0, reposto: 0 }
        const v: Linha = { ...padrao, ...rascunho.linhas[p.id] }
        const encontrado = Math.min(v.encontrado, naLoja)
        const vendido = direta ? v.reposto : naLoja - encontrado
        const fica = direta ? 0 : encontrado - v.recolhido - v.baixado + v.reposto
        const preco = precoVigente(precos.data ?? [], p.id, l.modalidade)?.preco_loja
        return { produto: p, naLoja, comigo, ...v, encontrado, vendido, fica, preco }
      })
      // Fora de linha ou que a loja não compra: só aparece se ainda houver pacote lá para contar.
      .filter((x) => (x.produto.ativo && !fora.data?.some((f) => f.loja_id === l.id && f.produto_id === x.produto.id)) || x.naLoja > 0)
  }, [l, produtos.data, saldosLoja.data, saldosRep.data, precos.data, rascunho.linhas, direta, fora.data, estoque.versao])

  if (loja.isPending || produtos.isPending || saldosLoja.isPending || saldosRep.isPending) return <Carregando />
  if (!l) return <Vazio>Loja não encontrada.</Vazio>

  const mudar = (produtoId: string, atual: Linha, campo: keyof Linha, valor: number) =>
    setRascunho((r) => ({ ...r, linhas: { ...r.linhas, [produtoId]: { ...atual, [campo]: valor } } }))

  const totalVendido = linhas.reduce((s, x) => s + x.vendido, 0)
  const totalReposto = linhas.reduce((s, x) => s + x.reposto, 0)
  const semPreco = linhas.filter((x) => x.vendido > 0 && x.preco === undefined)
  const valor = linhas.reduce((s, x) => s + x.vendido * (x.preco ?? 0), 0)
  const faltaEstoque = linhas.filter((x) => x.reposto > x.comigo + x.recolhido)

  // O estoque que vale é o de quem cuida da loja, que pode não ser quem está
  // com o app aberto (a gestão registra visita por qualquer representante).
  const minhaLoja = l.representante_id === meuRepresentanteId
  const dono = minhaLoja ? 'Você' : (representantes.data?.find((r) => r.id === l.representante_id)?.nome ?? 'O representante')
  const semEstoque = linhas.every((x) => x.comigo === 0)
  const semPrecoAlgum = precos.data !== undefined && linhas.some((x) => x.produto.ativo && x.preco === undefined)
  const lanca = papel === 'gestao' || papel === 'producao'

  async function enviar() {
    const itens: ItemVisitaEnvio[] = linhas.map((x) => ({
      produto_id: x.produto.id,
      encontrado: x.encontrado,
      recolhido: x.recolhido,
      baixado: x.baixado,
      reposto: x.reposto,
    }))
    const resumo = linhas.filter((x) => x.vendido > 0).map((x) => `${x.produto.nome}: ${x.vendido} x ${reais(x.preco ?? 0)}`)
    setErroRetirada(null)
    try {
      // O que é recolhido nesta visita já conta como estoque em mãos.
      await estoque.garantir(itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.reposto - i.recolhido })))
    } catch (e) {
      return setErroRetirada(e)
    }
    const r = await registrar.mutateAsync({ id: rascunho.id, lojaId, itens, observacoes: rascunho.observacoes })
    localStorage.removeItem(chave(lojaId))
    // A visita já está gravada; se a foto falhar, a visita continua valendo.
    if (foto) {
      try {
        const path = await enviarArquivo('fotos', 'visitas', r.visita_id, foto)
        await anexar.mutateAsync({ alvo: 'visita', id: r.visita_id, path })
      } catch {
        setAvisoFoto('A visita foi gravada, mas a foto não subiu.')
      }
    }
    setResultado({ ...r, resumo })
  }

  if (resultado) {
    return (
      <div className="space-y-4">
        <Titulo apoio={l.nome}>Visita registrada.</Titulo>
        {avisoFoto && <Aviso>{avisoFoto}</Aviso>}
        {resultado.acerto_id ? (
          <Cartao className="border-ouro bg-ouro/10">
            <Rotulo>Valor do acerto</Rotulo>
            <p className="mt-1 text-4xl font-bold">{reais(Number(resultado.valor_total))}</p>
            <p className="mt-2 text-sm text-marrom/75">
              A loja paga por Pix direto na chave da Viva Noz. Você não recebe dinheiro. O acerto fica pendente até a gestão confirmar o Pix.
            </p>
          </Cartao>
        ) : (
          <Cartao>
            <p className="text-sm">Não houve venda nesta visita, então não há acerto.</p>
          </Cartao>
        )}
        <ResumoVisita visitaId={resultado.visita_id} />
        <BotaoLink para={`/lojas/${l.id}`} variante="secundario" cheio>
          Voltar para a loja
        </BotaoLink>
      </div>
    )
  }

  if (conferindo) {
    return (
      <div className="space-y-4">
        <Titulo apoio={l.nome}>Confira antes de gravar.</Titulo>
        <Cartao>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-marrom/60 uppercase">
                <th className="pb-1 font-semibold">Produto</th>
                <th className="pb-1 text-right font-semibold">Vendeu</th>
                <th className="pb-1 text-right font-semibold">{direta ? 'Entregue' : 'Repôs'}</th>
                {!direta && <th className="pb-1 text-right font-semibold">Fica</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((x) => (
                <tr key={x.produto.id} className="border-t border-linha">
                  <td className="py-2">
                    {x.produto.nome_curto}
                    {(x.recolhido > 0 || x.baixado > 0) && (
                      <span className="block text-xs text-marrom/60">
                        {[x.recolhido > 0 && `recolhe ${x.recolhido}`, x.baixado > 0 && `baixa ${x.baixado}`].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-base font-bold">{x.vendido}</td>
                  <td className="py-2 text-right">{x.reposto}</td>
                  {!direta && <td className="py-2 text-right">{x.fica}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
        <Cartao className="border-ouro bg-ouro/10">
          <Rotulo>A loja paga</Rotulo>
          <p className="mt-1 text-4xl font-bold">{reais(valor)}</p>
          <p className="text-xs text-marrom/70">{pacotes(totalVendido)} vendidos</p>
        </Cartao>
        <label className="block rounded-2xl border border-dashed border-marrom/30 p-4 text-sm font-semibold">
          Foto do expositor {foto ? '· anexada' : '(opcional)'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-sm font-normal file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-marrom/30 file:bg-transparent file:px-4 file:font-semibold file:text-marrom"
          />
        </label>
        <p className="text-sm text-marrom/75">Depois de gravar, a visita não pode ser editada. Se houver erro, a gestão faz o estorno.</p>
        <Aviso erro={erroRetirada ?? registrar.error} />
        <Botao cheio disabled={registrar.isPending} onClick={enviar}>
          {registrar.isPending ? 'Gravando.' : registrar.error ? 'Tentar de novo' : 'Gravar visita'}
        </Botao>
        <Botao variante="secundario" cheio disabled={registrar.isPending} onClick={() => { registrar.reset(); setConferindo(false) }}>
          Voltar e corrigir
        </Botao>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Titulo apoio={direta ? 'Compra direta: informe quanto entregou de cada sabor.' : 'Conte o que está na prateleira e informe o que repôs.'}>
        {l.nome}
      </Titulo>

      {semEstoque && (
        <Cartao className="border-alerta/40 bg-alerta/8">
          <p className="font-semibold">{dono} está sem estoque no app.</p>
          <p className="mt-1 text-sm text-marrom/80">
            {estoque.direto ? 'Não há pacote pronto no app, nem com você nem na fábrica. Registre a produção e volte aqui.' : `Só dá para repor o que foi retirado na fábrica. ${lanca ? 'Registre a retirada primeiro e volte aqui.' : 'Peça à gestão ou à produção para registrar a sua retirada.'}`}
          </p>
          {lanca && (
            <div className="mt-3">
              <BotaoLink para="/estoque" cheio>
                {estoque.direto ? 'Abrir estoque' : 'Registrar retirada'}
              </BotaoLink>
            </div>
          )}
        </Cartao>
      )}

      {semPrecoAlgum && (
        <Cartao className="border-alerta/40 bg-alerta/8">
          <p className="font-semibold">Falta cadastrar preço.</p>
          <p className="mt-1 text-sm text-marrom/80">
            Sem o preço de loja, o app não calcula o acerto quando houver venda. {papel === 'gestao' ? 'Lance os preços dos sabores.' : 'Avise a gestão.'}
          </p>
          {papel === 'gestao' && (
            <div className="mt-3">
              <BotaoLink para="/mais/precos" variante="secundario" cheio>
                Abrir tabela de preços
              </BotaoLink>
            </div>
          )}
        </Cartao>
      )}

      {linhas.map((x) => {
        const atual: Linha = { encontrado: x.encontrado, recolhido: x.recolhido, baixado: x.baixado, reposto: x.reposto }
        const aberto = x.recolhido > 0 || x.baixado > 0
        return (
          <Cartao key={x.produto.id}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-serif text-2xl leading-tight font-semibold">{x.produto.nome}</h2>
              {!direta && <p className="shrink-0 text-xs font-semibold text-marrom/65">tinha {x.naLoja}</p>}
            </div>

            {!direta && x.naLoja > 0 && (
              <>
                <Contador
                  rotulo="Encontrei"
                  apoio={x.vendido > 0 ? <strong className="text-verde">vendeu {x.vendido}</strong> : 'nada vendido'}
                  valor={x.encontrado}
                  maximo={x.naLoja}
                  aoMudar={(n) =>
                    setRascunho((r) => ({
                      ...r,
                      linhas: {
                        ...r.linhas,
                        // Recolhido e baixado nunca passam do que foi encontrado.
                        [x.produto.id]: {
                          ...atual,
                          encontrado: n,
                          recolhido: Math.min(atual.recolhido, n),
                          baixado: Math.min(atual.baixado, Math.max(0, n - Math.min(atual.recolhido, n))),
                        },
                      },
                    }))
                  }
                />
                <details open={aberto} className="group">
                  <summary className="cursor-pointer py-1.5 text-sm font-semibold text-verde underline underline-offset-4">
                    Recolher ou dar baixa
                  </summary>
                  <Contador rotulo="Recolhi" apoio="levo de volta, em bom estado" valor={x.recolhido} maximo={x.encontrado - x.baixado} aoMudar={(n) => mudar(x.produto.id, atual, 'recolhido', n)} />
                  <Contador rotulo="Baixa" apoio="vencido ou danificado" valor={x.baixado} maximo={x.encontrado - x.recolhido} aoMudar={(n) => mudar(x.produto.id, atual, 'baixado', n)} />
                </details>
              </>
            )}

            {x.produto.ativo && (
              <Contador
                rotulo={direta ? 'Entreguei' : 'Repus'}
                apoio={x.comigo + x.recolhido === 0 ? `${dono.toLowerCase() === 'você' ? 'você está' : dono + ' está'} sem estoque deste sabor` : `${minhaLoja ? 'você tem' : dono + ' tem'} ${x.comigo + x.recolhido}`}
                valor={x.reposto}
                maximo={x.comigo + x.recolhido}
                aoMudar={(n) => mudar(x.produto.id, atual, 'reposto', n)}
              />
            )}

            {!direta && <p className="mt-1 border-t border-linha pt-2 text-right text-sm">Fica na loja: <strong>{x.fica}</strong></p>}
          </Cartao>
        )
      })}

      <AreaDeTexto rotulo="Observações" valor={rascunho.observacoes} aoMudar={(v) => setRascunho((r) => ({ ...r, observacoes: v }))} dica="Opcional." />

      {semPreco.length > 0 && (
        <Aviso>Falta preço cadastrado para {semPreco.map((x) => x.produto.nome_curto).join(', ')}. Peça à gestão para cadastrar antes de gravar.</Aviso>
      )}
      {faltaEstoque.length > 0 && <Aviso>Você não tem estoque suficiente de {faltaEstoque.map((x) => x.produto.nome_curto).join(', ')}.</Aviso>}

      <div className="sticky bottom-[72px] rounded-2xl border border-linha bg-profundo p-4 text-creme shadow-lg">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-creme/70">
              {pacotes(totalVendido)} vendidos · {totalReposto} {direta ? 'entregues' : 'repostos'}
            </p>
            <p className="text-3xl font-bold">{reais(valor)}</p>
          </div>
          <button
            type="button"
            disabled={semPreco.length > 0 || faltaEstoque.length > 0}
            onClick={() => setConferindo(true)}
            className="min-h-12 rounded-xl bg-creme px-5 text-[15px] font-bold text-profundo disabled:opacity-40"
          >
            Conferir
          </button>
        </div>
      </div>
    </div>
  )
}
