import { useParams } from 'react-router-dom'
import { EnviarArquivo, Foto } from '../components/arquivos'
import { Aviso, Botao, BotaoLink, Cartao, Carregando, Etiqueta, Rotulo, SaldoPorProduto, Titulo, Vazio } from '../components/ui'
import { useAcertos, useAlternarProdutoDaLoja, useEstornarVisita, useLoja, useProdutosFora, useSalvarLoja, useProdutos, useRepresentantes, useSaldosLoja, useVisitas } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_MODALIDADE, data, dataHora, reais } from '../lib/formato'

export function LojaDetalhe() {
  const { id } = useParams()
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const loja = useLoja(id)
  const produtos = useProdutos()
  const saldos = useSaldosLoja()
  const visitas = useVisitas(id)
  const acertos = useAcertos()
  const representantes = useRepresentantes()
  const estornar = useEstornarVisita()
  const salvarLoja = useSalvarLoja()
  const fora = useProdutosFora()
  const alternar = useAlternarProdutoDaLoja()

  if (loja.isPending || produtos.isPending) return <Carregando />
  if (loja.error) return <Aviso erro={loja.error} />
  if (!loja.data) return <Vazio>Loja não encontrada.</Vazio>

  const l = loja.data
  const nome = (produtoId: string) => produtos.data?.find((p) => p.id === produtoId)?.nome_curto ?? '?'
  const trabalha = (produtoId: string) => !fora.data?.some((f) => f.loja_id === l.id && f.produto_id === produtoId)
  const saldo = (produtos.data ?? [])
    .map((p) => ({
      nome: p.nome_curto,
      trabalha: trabalha(p.id),
      quantidade: (saldos.data ?? []).find((s) => s.loja_id === l.id && s.produto_id === p.id)?.saldo ?? 0,
    }))
    // Sabor que a loja não compra só aparece se ainda tiver pacote lá.
    .filter((s) => s.trabalha || s.quantidade > 0)
  const acertosDaLoja = (acertos.data ?? []).filter((a) => a.loja_id === l.id)
  const pendente = acertosDaLoja.filter((a) => a.status === 'pendente').reduce((soma, a) => soma + Number(a.valor_total), 0)
  const podeVisitar = l.status === 'ativa' && (ehGestao || l.representante_id === meuRepresentanteId)
  const ultimaValida = visitas.data?.find((v) => !v.estornada_em)
  const direta = l.modalidade === 'compra_direta'

  function pedirEstorno(visitaId: string) {
    const motivo = window.prompt('Estornar esta visita desfaz a contagem, a reposição e o acerto. Qual o motivo?')
    if (motivo?.trim()) estornar.mutate({ visitaId, motivo })
  }

  return (
    <div className="space-y-4">
      {l.foto_path && <Foto caminho={l.foto_path} nome={l.nome} formato="capa" className="aspect-[16/9] w-full" />}
      <Titulo
        apoio={[[l.endereco, l.numero].filter(Boolean).join(', '), l.complemento, l.bairro, `${l.cidade}/${l.uf}`].filter(Boolean).join(' · ')}
      >
        {l.nome}
      </Titulo>

      <div className="flex flex-wrap gap-2">
        <Etiqueta tom="verde">{NOME_MODALIDADE[l.modalidade]}</Etiqueta>
        {l.status !== 'ativa' && <Etiqueta tom="alerta">{l.status === 'pausada' ? 'Pausada' : 'Encerrada'}</Etiqueta>}
        {ehGestao && <Etiqueta>{representantes.data?.find((r) => r.id === l.representante_id)?.nome}</Etiqueta>}
        <Etiqueta>Desde {data(l.data_abertura)}</Etiqueta>
      </div>

      {!direta && (
        <Cartao>
          <Rotulo>Na loja agora</Rotulo>
          <div className="mt-3">
            <SaldoPorProduto itens={saldo} />
          </div>
        </Cartao>
      )}

      {(ehGestao || l.representante_id === meuRepresentanteId) && (
        <Cartao>
          <Rotulo>Sabores que esta loja compra</Rotulo>
          <div className="mt-3 flex flex-wrap gap-2">
            {(produtos.data ?? []).filter((p) => p.ativo).map((p) => {
              const marcado = trabalha(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={marcado}
                  disabled={alternar.isPending}
                  onClick={() => alternar.mutate({ lojaId: l.id, produtoId: p.id, trabalha: !marcado })}
                  className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${marcado ? 'border-verde bg-verde text-creme' : 'border-marrom/30 text-marrom/55 line-through'}`}
                >
                  {p.nome_curto}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-marrom/65">Toque para marcar ou desmarcar. Sabor desmarcado não entra no aviso de reposição nem na tela de visita.</p>
          <Aviso erro={alternar.error} />
        </Cartao>
      )}

      {pendente > 0 && (
        <Cartao className="border-ouro bg-ouro/10">
          <Rotulo>A loja deve</Rotulo>
          <p className="mt-1 text-2xl font-bold">{reais(pendente)}</p>
          <p className="text-xs text-marrom/70">Pix direto na chave da Viva Noz. A gestão confirma o recebimento.</p>
        </Cartao>
      )}

      {podeVisitar && (
        <BotaoLink para={`/lojas/${l.id}/visita`} cheio>
          {direta ? 'Registrar entrega' : 'Registrar visita'}
        </BotaoLink>
      )}

      {(l.contato_nome || l.contato_telefone || l.observacoes) && (
        <Cartao>
          <Rotulo>Contato</Rotulo>
          <p className="mt-2 text-sm">{[l.contato_nome, l.contato_telefone].filter(Boolean).join(' · ')}</p>
          {l.observacoes && <p className="mt-2 text-sm whitespace-pre-line text-marrom/75">{l.observacoes}</p>}
        </Cartao>
      )}

      <section className="space-y-2.5">
        <Rotulo>Visitas</Rotulo>
        <Aviso erro={estornar.error} />
        {visitas.data?.length === 0 && <Vazio>Nenhuma visita registrada.</Vazio>}
        {visitas.data?.map((v) => {
          const acerto = acertosDaLoja.find((a) => a.visita_id === v.id)
          return (
            <Cartao key={v.id} className={v.estornada_em ? 'opacity-60' : ''}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{dataHora(v.realizada_em)}</p>
                {v.estornada_em ? (
                  <Etiqueta tom="alerta">Estornada</Etiqueta>
                ) : acerto ? (
                  <Etiqueta tom={acerto.status === 'confirmado' ? 'verde' : 'ouro'}>
                    {reais(acerto.valor_total)} · {acerto.status === 'confirmado' ? 'pago' : acerto.status === 'cancelado' ? 'cancelado' : 'pendente'}
                  </Etiqueta>
                ) : (
                  <Etiqueta>Sem venda</Etiqueta>
                )}
              </div>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-marrom/60 uppercase">
                    <th className="pb-1 font-semibold">Produto</th>
                    <th className="pb-1 text-right font-semibold">Vendeu</th>
                    <th className="pb-1 text-right font-semibold">Repôs</th>
                    <th className="pb-1 text-right font-semibold">Ficou</th>
                  </tr>
                </thead>
                <tbody>
                  {v.visita_itens.map((i) => (
                    <tr key={i.produto_id} className="border-t border-linha">
                      <td className="py-1.5">
                        {nome(i.produto_id)}
                        {(i.recolhido > 0 || i.baixado > 0) && (
                          <span className="block text-xs text-marrom/60">
                            {[i.recolhido > 0 && `recolheu ${i.recolhido}`, i.baixado > 0 && `baixa ${i.baixado}`].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-semibold">{i.vendido}</td>
                      <td className="py-1.5 text-right">{i.reposto}</td>
                      <td className="py-1.5 text-right">{i.saldo_final}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {v.foto_path && <Foto caminho={v.foto_path} nome="Foto da visita" formato="quadrada" className="mt-3 aspect-[4/3] w-full" />}
              {v.observacoes && <p className="mt-2 text-sm text-marrom/75">{v.observacoes}</p>}
              {v.estorno_motivo && <p className="mt-2 text-sm text-alerta">Estorno: {v.estorno_motivo}</p>}
              {ehGestao && ultimaValida?.id === v.id && acerto?.status !== 'confirmado' && (
                <div className="mt-2">
                  <Botao variante="discreto" disabled={estornar.isPending} onClick={() => pedirEstorno(v.id)}>
                    Estornar esta visita
                  </Botao>
                </div>
              )}
            </Cartao>
          )
        })}
      </section>

      {(ehGestao || l.representante_id === meuRepresentanteId) && (
        <div className="space-y-3">
          <EnviarArquivo espaco="fotos" pasta="lojas" id={l.id} aoEnviar={(path) => salvarLoja.mutateAsync({ id: l.id, foto_path: path })}>
            {l.foto_path ? 'Trocar foto da loja' : 'Adicionar foto da loja'}
          </EnviarArquivo>
          <BotaoLink para={`/lojas/${l.id}/editar`} variante="secundario" cheio>
            Editar cadastro
          </BotaoLink>
        </div>
      )}
    </div>
  )
}
