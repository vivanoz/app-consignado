import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EnviarArquivo, Foto, VerArquivo } from '../components/arquivos'
import { AreaDeTexto, Aviso, Botao, Campo, Cartao, Carregando, Etiqueta, Rotulo, Titulo, Vazio } from '../components/ui'
import {
  useAcertos,
  useAnexar,
  useComissoes,
  useConfirmarPagamento,
  useEstornarVendaVarejo,
  useLojas,
  useProdutos,
  useRegistrarRepasse,
  useRepasses,
  useRepresentantes,
} from '../lib/api'
import { enviarArquivo } from '../lib/arquivos'
import { useAcesso } from '../lib/auth'
import { NOME_MODALIDADE, data, hoje, porcento, reais } from '../lib/formato'
import type { Acerto, AcertoStatus, Comissao, Representante } from '../lib/tipos'

const soma = (valores: number[]) => valores.reduce((s, v) => s + Number(v), 0)

function Abas<T extends string>({ abas, atual, aoMudar }: { abas: { id: T; nome: string }[]; atual: T; aoMudar: (id: T) => void }) {
  return (
    <div className="flex rounded-xl border border-linha bg-papel p-1">
      {abas.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => aoMudar(a.id)}
          className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${atual === a.id ? 'bg-verde text-creme' : 'text-marrom/70'}`}
        >
          {a.nome}
        </button>
      ))}
    </div>
  )
}

// Dois fluxos de dinheiro, lado a lado:
//   Lojas: o que cada loja deve à Viva Noz (acertos) e o Pix recebido.
//   Comissões: o que a Viva Noz deve a cada representante e o que já pagou.
export function Financeiro() {
  const { ehGestao } = useAcesso()
  const [area, setArea] = useState<'lojas' | 'comissoes'>('lojas')

  return (
    <div className="space-y-4">
      <Titulo>Financeiro</Titulo>
      <Abas
        abas={[
          { id: 'lojas', nome: 'A receber' },
          { id: 'comissoes', nome: ehGestao ? 'Pagar representantes' : 'Você recebe' },
        ]}
        atual={area}
        aoMudar={setArea}
      />
      {area === 'lojas' ? <AcertosDasLojas /> : ehGestao ? <ComissoesGestao /> : <MinhasComissoes />}
    </div>
  )
}

// ───────────────────────── Lojas pagam ─────────────────────────

function AcertosDasLojas() {
  const { ehGestao } = useAcesso()
  const acertos = useAcertos()
  const lojas = useLojas()
  const representantes = useRepresentantes()
  const produtos = useProdutos()
  const [aba, setAba] = useState<AcertoStatus>('pendente')

  if (acertos.isPending) return <Carregando />
  if (acertos.error) return <Aviso erro={acertos.error} />

  const lista = acertos.data.filter((a) => a.status === aba)

  return (
    <div className="space-y-3">
      <p className="text-sm text-marrom/75">
        A loja paga por Pix direto à Viva Noz. Na venda varejo, quem vendeu repassa o valor. Só a gestão confirma o recebimento.
      </p>
      <Abas
        abas={[
          { id: 'pendente', nome: 'Pendentes' },
          { id: 'confirmado', nome: 'Pagos' },
          { id: 'cancelado', nome: 'Cancelados' },
        ]}
        atual={aba}
        aoMudar={setAba}
      />

      {lista.length === 0 ? (
        <Vazio>Nenhum acerto aqui.</Vazio>
      ) : (
        <p className="text-sm text-marrom/75">
          {lista.length} {lista.length === 1 ? 'acerto' : 'acertos'} · <strong>{reais(soma(lista.map((a) => a.valor_total)))}</strong>
        </p>
      )}

      {lista.map((a) => (
        <CartaoAcerto
          key={a.id}
          acerto={a}
          loja={lojas.data?.find((l) => l.id === a.loja_id)?.nome ?? 'Loja'}
          vendedor={representantes.data?.find((r) => r.id === a.representante_id)?.nome ?? 'Representante'}
          nomeProduto={(id) => produtos.data?.find((p) => p.id === id)?.nome_curto ?? '?'}
          podeConfirmar={ehGestao}
        />
      ))}
    </div>
  )
}

function CartaoAcerto({
  acerto,
  loja,
  vendedor,
  nomeProduto,
  podeConfirmar,
}: {
  acerto: Acerto
  loja: string
  vendedor: string
  nomeProduto: (id: string) => string
  podeConfirmar: boolean
}) {
  const confirmar = useConfirmarPagamento()
  const anexar = useAnexar()
  const estornar = useEstornarVendaVarejo()
  const varejo = acerto.modalidade === 'varejo'
  const [confirmando, setConfirmando] = useState(false)
  const [recebidoEm, setRecebidoEm] = useState(hoje())
  const pagamento = acerto.pagamentos[0]
  const pendente = acerto.status === 'pendente'

  return (
    <Cartao>
      <div className="flex items-start justify-between gap-3">
        <div>
          {varejo ? (
            <p className="text-[17px] font-bold">Venda varejo · {vendedor}</p>
          ) : (
            <Link to={`/lojas/${acerto.loja_id}`} className="text-[17px] font-bold underline decoration-linha underline-offset-4">
              {loja}
            </Link>
          )}
          <p className="text-xs text-marrom/65">
            {varejo ? `Lançada em ${data(acerto.criado_em)} · dinheiro com ${vendedor}` : `Visita de ${data(acerto.criado_em)} · ${NOME_MODALIDADE[acerto.modalidade]}`}
          </p>
        </div>
        <p className="text-xl font-bold whitespace-nowrap">{reais(acerto.valor_total)}</p>
      </div>

      <ul className="mt-3 space-y-0.5 text-sm text-marrom/80">
        {acerto.acerto_itens.map((i) => (
          <li key={i.produto_id} className="flex justify-between">
            <span>
              {nomeProduto(i.produto_id)} · {i.quantidade} x {reais(i.preco_unitario)}
            </span>
            <span>{reais(i.subtotal)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {acerto.status === 'confirmado' && pagamento && <Etiqueta tom="verde">Recebido em {data(pagamento.recebido_em)}</Etiqueta>}
        {pendente && <Etiqueta tom={acerto.comprovante_path ? 'ouro' : 'neutro'}>{acerto.comprovante_path ? 'Comprovante enviado, aguarda conferência' : varejo ? 'Aguardando repasse' : 'Aguardando Pix'}</Etiqueta>}
        {acerto.comprovante_path && (
          <VerArquivo espaco="comprovantes" caminho={acerto.comprovante_path}>
            Ver comprovante
          </VerArquivo>
        )}
      </div>

      {(pendente || (podeConfirmar && acerto.status === 'confirmado')) && !confirmando && (
        <div className="mt-2">
          <EnviarArquivo
            espaco="comprovantes"
            pasta="acertos"
            id={acerto.id}
            aceitaPdf
            variante="discreto"
            aoEnviar={(path) => anexar.mutateAsync({ alvo: 'acerto', id: acerto.id, path })}
          >
            {acerto.comprovante_path ? 'Trocar comprovante do Pix' : 'Anexar comprovante do Pix'}
          </EnviarArquivo>
        </div>
      )}

      {pendente && podeConfirmar && !confirmando && (
        <div className="mt-2">
          <Botao variante="secundario" cheio onClick={() => setConfirmando(true)}>
            {varejo ? 'Confirmar valor recebido' : 'Confirmar Pix recebido'}
          </Botao>
          {varejo && acerto.venda_varejo_id && (
            <div className="mt-1 text-center">
              <Botao
                variante="discreto"
                disabled={estornar.isPending}
                onClick={() => {
                  const motivo = window.prompt('Estornar devolve os pacotes ao estoque de quem vendeu e cancela este valor. Qual o motivo?')
                  if (motivo?.trim()) estornar.mutate({ vendaId: acerto.venda_varejo_id!, motivo })
                }}
              >
                Estornar esta venda
              </Botao>
            </div>
          )}
          <Aviso erro={estornar.error} />
        </div>
      )}

      {confirmando && pendente && (
        <div className="mt-3 space-y-3 border-t border-linha pt-3">
          <p className="text-sm">
            {varejo
              ? <>Confira se os <strong>{reais(acerto.valor_total)}</strong> desta venda chegaram à conta da Viva Noz.</>
              : <>Confira no extrato do banco se entrou um Pix de <strong>{reais(acerto.valor_total)}</strong> desta loja.</>}{' '}
            A confirmação não pode ser desfeita e gera a comissão do representante.
          </p>
          <Campo rotulo="Data em que o dinheiro entrou" type="date" max={hoje()} value={recebidoEm} onChange={(e) => setRecebidoEm(e.target.value)} />
          <Aviso erro={confirmar.error} />
          <Botao
            cheio
            disabled={confirmar.isPending || !recebidoEm}
            onClick={() => confirmar.mutate({ acertoId: acerto.id, valor: Number(acerto.valor_total), recebidoEm })}
          >
            {confirmar.isPending ? 'Confirmando.' : `Confirmar ${reais(acerto.valor_total)}`}
          </Botao>
          <Botao variante="discreto" cheio onClick={() => setConfirmando(false)}>
            Cancelar
          </Botao>
        </div>
      )}
    </Cartao>
  )
}

// ───────────────────────── Comissões ─────────────────────────

function LinhaComissao({ comissao, loja, marcada, aoMarcar }: { comissao: Comissao; loja: string; marcada?: boolean; aoMarcar?: () => void }) {
  const vencida = comissao.status === 'pendente' && comissao.vencimento <= hoje()
  const conteudo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {loja} · {comissao.tipo === 'bonus_abertura' ? 'bônus de abertura' : `${porcento(comissao.percentual ?? 0)} de ${reais(comissao.base ?? 0)}`}
        </span>
        <span className={`block text-xs ${vencida ? 'font-semibold text-alerta' : 'text-marrom/65'}`}>
          Recebido em {data(comissao.recebido_em)} · {comissao.status === 'paga' ? 'paga' : `vence em ${data(comissao.vencimento)}`}
        </span>
      </span>
      <strong className="whitespace-nowrap">{reais(comissao.valor)}</strong>
    </>
  )
  return aoMarcar ? (
    <label className="flex cursor-pointer items-center gap-3 py-2.5">
      <input type="checkbox" checked={marcada} onChange={aoMarcar} className="size-5 shrink-0 accent-[#455020]" />
      {conteudo}
    </label>
  ) : (
    <div className="flex items-center gap-3 py-2.5">{conteudo}</div>
  )
}

// Representante: quanto tem a receber, quando, e o que já foi pago.
function MinhasComissoes() {
  const { meuRepresentanteId } = useAcesso()
  const comissoes = useComissoes()
  const repasses = useRepasses()
  const lojas = useLojas()

  if (comissoes.isPending || repasses.isPending) return <Carregando />

  const nomeLoja = (id: string | null) => (id ? (lojas.data?.find((l) => l.id === id)?.nome ?? 'Loja') : 'Venda varejo')
  const minhas = comissoes.data?.filter((c) => c.representante_id === meuRepresentanteId) ?? []
  const pendentes = minhas.filter((c) => c.status === 'pendente')
  const vencimentos = [...new Set(pendentes.map((c) => c.vencimento))].sort()

  return (
    <div className="space-y-4">
      <p className="text-sm text-marrom/75">
        Sua comissão nasce quando a gestão confirma o Pix da loja. O pagamento sai no 5º dia útil do mês seguinte ao do Pix.
      </p>

      <Cartao className="border-ouro bg-ouro/10">
        <Rotulo>Você tem a receber</Rotulo>
        <p className="mt-1 text-4xl font-bold">{reais(soma(pendentes.map((c) => c.valor)))}</p>
        <p className="text-xs text-marrom/70">{vencimentos[0] ? `Próximo pagamento em ${data(vencimentos[0])}.` : 'Nada pendente por enquanto.'}</p>
      </Cartao>

      {vencimentos.map((v) => {
        const doDia = pendentes.filter((c) => c.vencimento === v)
        return (
          <Cartao key={v} className="py-2">
            <div className="flex items-center justify-between border-b border-linha py-2">
              <Rotulo>Pagamento em {data(v)}</Rotulo>
              <strong>{reais(soma(doDia.map((c) => c.valor)))}</strong>
            </div>
            <div className="divide-y divide-linha">
              {doDia.map((c) => (
                <LinhaComissao key={c.id} comissao={c} loja={nomeLoja(c.loja_id)} />
              ))}
            </div>
          </Cartao>
        )
      })}

      <section className="space-y-2.5">
        <Rotulo>Já recebido</Rotulo>
        {repasses.data?.length === 0 && <Vazio>Nenhum pagamento recebido ainda.</Vazio>}
        {repasses.data?.map((r) => {
          const itens = minhas.filter((c) => c.repasse_id === r.id)
          return (
            <Cartao key={r.id} className="py-2">
              <div className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-bold">Pago em {data(r.pago_em)}</p>
                  {r.comprovante_path && (
                    <VerArquivo espaco="comprovantes" caminho={r.comprovante_path}>
                      Ver comprovante
                    </VerArquivo>
                  )}
                </div>
                <p className="text-xl font-bold">{reais(r.valor_total)}</p>
              </div>
              <div className="divide-y divide-linha border-t border-linha">
                {itens.map((c) => (
                  <LinhaComissao key={c.id} comissao={c} loja={nomeLoja(c.loja_id)} />
                ))}
              </div>
            </Cartao>
          )
        })}
      </section>
    </div>
  )
}

// Gestão: o que deve a cada representante, pagamento em grupo com
// comprovante, e o histórico do que já foi pago.
function ComissoesGestao() {
  const comissoes = useComissoes()
  const repasses = useRepasses()
  const representantes = useRepresentantes()
  const lojas = useLojas()
  const [aba, setAba] = useState<'pagar' | 'pagos'>('pagar')

  if (comissoes.isPending || repasses.isPending || representantes.isPending) return <Carregando />

  const nomeLoja = (id: string | null) => (id ? (lojas.data?.find((l) => l.id === id)?.nome ?? 'Loja') : 'Venda varejo')
  const pendentes = comissoes.data?.filter((c) => c.status === 'pendente') ?? []
  const comPendencia = representantes.data?.filter((r) => pendentes.some((c) => c.representante_id === r.id)) ?? []

  return (
    <div className="space-y-3">
      <p className="text-sm text-marrom/75">
        A comissão nasce quando você confirma o Pix da loja e vence no 5º dia útil do mês seguinte.
      </p>
      <Abas
        abas={[
          { id: 'pagar', nome: `A pagar · ${reais(soma(pendentes.map((c) => c.valor)))}` },
          { id: 'pagos', nome: 'Pagos' },
        ]}
        atual={aba}
        aoMudar={setAba}
      />

      {aba === 'pagar' && comPendencia.length === 0 && <Vazio>Nenhuma comissão a pagar.</Vazio>}
      {aba === 'pagar' &&
        comPendencia.map((r) => (
          <PagarRepresentante key={r.id} representante={r} pendentes={pendentes.filter((c) => c.representante_id === r.id)} nomeLoja={nomeLoja} />
        ))}

      {aba === 'pagos' && repasses.data?.length === 0 && <Vazio>Nenhum pagamento registrado.</Vazio>}
      {aba === 'pagos' &&
        repasses.data?.map((r) => {
          const itens = comissoes.data?.filter((c) => c.repasse_id === r.id) ?? []
          return <RepasseFeito key={r.id} repasse={r} itens={itens} nomeLoja={nomeLoja} representante={representantes.data?.find((x) => x.id === r.representante_id)} />
        })}
    </div>
  )
}

function PagarRepresentante({ representante, pendentes, nomeLoja }: { representante: Representante; pendentes: Comissao[]; nomeLoja: (id: string | null) => string }) {
  const registrar = useRegistrarRepasse()
  // Já vêm marcadas as que venceram; o resto a gestão marca se quiser adiantar.
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(pendentes.filter((c) => c.vencimento <= hoje()).map((c) => c.id)))
  const [pagando, setPagando] = useState(false)
  const [repasseId, setRepasseId] = useState(() => crypto.randomUUID())
  const [pagoEm, setPagoEm] = useState(hoje())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  const escolhidas = pendentes.filter((c) => marcadas.has(c.id))
  const total = soma(escolhidas.map((c) => c.valor))
  const alternar = (id: string) =>
    setMarcadas((atual) => {
      const novo = new Set(atual)
      if (!novo.delete(id)) novo.add(id)
      return novo
    })

  async function pagar() {
    setErro(null)
    setEnviando(true)
    try {
      const comprovantePath = arquivo ? await enviarArquivo('comprovantes', 'repasses', repasseId, arquivo) : null
      await registrar.mutateAsync({ id: repasseId, representanteId: representante.id, comissaoIds: escolhidas.map((c) => c.id), pagoEm, comprovantePath, observacao })
      setPagando(false)
      setArquivo(null)
      setObservacao('')
      setMarcadas(new Set())
      setRepasseId(crypto.randomUUID())
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Cartao className="py-2">
      <div className="flex items-center gap-3 border-b border-linha py-2">
        <Foto caminho={representante.foto_path} nome={representante.nome} className="size-11 text-base" />
        <div className="flex-1">
          <p className="font-bold">{representante.nome}</p>
          <p className="text-xs text-marrom/65">
            {pendentes.length} {pendentes.length === 1 ? 'comissão pendente' : 'comissões pendentes'}
          </p>
        </div>
        <p className="text-xl font-bold">{reais(soma(pendentes.map((c) => c.valor)))}</p>
      </div>

      <div className="divide-y divide-linha">
        {pendentes.map((c) => (
          <LinhaComissao key={c.id} comissao={c} loja={nomeLoja(c.loja_id)} marcada={marcadas.has(c.id)} aoMarcar={pagando ? undefined : () => alternar(c.id)} />
        ))}
      </div>

      {!pagando ? (
        <div className="border-t border-linha py-2">
          <Botao cheio disabled={escolhidas.length === 0} onClick={() => setPagando(true)}>
            {escolhidas.length === 0 ? 'Marque o que vai pagar' : `Pagar ${reais(total)}`}
          </Botao>
        </div>
      ) : (
        <div className="space-y-3 border-t border-linha py-3">
          <p className="text-sm">
            Faça um Pix de <strong>{reais(total)}</strong> para {representante.nome}, referente a {escolhidas.length}{' '}
            {escolhidas.length === 1 ? 'item marcado' : 'itens marcados'}. Depois registre aqui.
          </p>
          <Campo rotulo="Data do pagamento" type="date" max={hoje()} value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} />
          <label className="block text-sm font-semibold">
            Comprovante do Pix
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm font-normal file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-marrom/30 file:bg-transparent file:px-4 file:font-semibold file:text-marrom"
            />
          </label>
          <AreaDeTexto rotulo="Observação" valor={observacao} aoMudar={setObservacao} dica="Opcional." />
          <Aviso erro={erro} />
          <Botao cheio disabled={enviando || !pagoEm} onClick={pagar}>
            {enviando ? 'Registrando.' : `Registrar pagamento de ${reais(total)}`}
          </Botao>
          <Botao variante="discreto" cheio disabled={enviando} onClick={() => setPagando(false)}>
            Cancelar
          </Botao>
        </div>
      )}
    </Cartao>
  )
}

function RepasseFeito({
  repasse,
  itens,
  nomeLoja,
  representante,
}: {
  repasse: { id: string; valor_total: number; pago_em: string; comprovante_path: string | null; observacao: string | null }
  itens: Comissao[]
  nomeLoja: (id: string | null) => string
  representante: Representante | undefined
}) {
  const anexar = useAnexar()
  return (
    <Cartao className="py-2">
      <div className="flex items-center gap-3 py-2">
        <Foto caminho={representante?.foto_path} nome={representante?.nome ?? '?'} className="size-11 text-base" />
        <div className="flex-1">
          <p className="font-bold">{representante?.nome}</p>
          <p className="text-xs text-marrom/65">
            Pago em {data(repasse.pago_em)} · {itens.length} {itens.length === 1 ? 'item' : 'itens'}
          </p>
        </div>
        <p className="text-xl font-bold">{reais(repasse.valor_total)}</p>
      </div>
      {repasse.observacao && <p className="pb-2 text-sm text-marrom/75">{repasse.observacao}</p>}
      <div className="divide-y divide-linha border-t border-linha">
        {itens.map((c) => (
          <LinhaComissao key={c.id} comissao={c} loja={nomeLoja(c.loja_id)} />
        ))}
      </div>
      <div className="border-t border-linha pt-1">
        {repasse.comprovante_path ? (
          <VerArquivo espaco="comprovantes" caminho={repasse.comprovante_path}>
            Ver comprovante
          </VerArquivo>
        ) : (
          <EnviarArquivo espaco="comprovantes" pasta="repasses" id={repasse.id} aceitaPdf variante="discreto" aoEnviar={(path) => anexar.mutateAsync({ alvo: 'repasse', id: repasse.id, path })}>
            Anexar comprovante
          </EnviarArquivo>
        )}
      </div>
    </Cartao>
  )
}
