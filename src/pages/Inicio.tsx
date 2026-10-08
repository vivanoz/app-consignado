import { CartaoLoja } from '../components/CartaoLoja'
import { BotaoLink, Cartao, Carregando, Rotulo, SaldoPorProduto, Titulo } from '../components/ui'
import { useAcertos, useAmostras, useComissoes, useInsumos, usePerfis, useProdutos, useProspectos, useSaldosRepresentante } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { data, hoje, inicioDoMes, pacotes, reais } from '../lib/formato'
import { porUrgencia, useResumoLojas } from '../lib/resumo'

const soma = (valores: number[]) => valores.reduce((s, v) => s + Number(v), 0)

export function Inicio() {
  const { perfil, papel, ehGestao, meuRepresentanteId } = useAcesso()
  const comLojas = papel !== 'producao'
  const produtos = useProdutos()
  const saldosRep = useSaldosRepresentante()
  const { resumo, carregando } = useResumoLojas(comLojas)
  const acertos = useAcertos(comLojas)
  const comissoes = useComissoes(comLojas)
  const perfis = usePerfis()
  const amostras = useAmostras(comLojas)
  const insumos = useInsumos(papel === 'gestao' || papel === 'producao')
  const insumosEmFalta = (insumos.data ?? []).filter((i) => i.ativo && (i.comprar || Number(i.saldo) < 0))
  const prospectos = useProspectos(comLojas)

  // Varejo e amostras do mês corrente, de quem a pessoa enxerga.
  const doMes = (acertos.data ?? []).filter((a) => a.modalidade === 'varejo' && a.status !== 'cancelado' && a.criado_em.slice(0, 10) >= inicioDoMes())
  const varejoMes = { valor: soma(doMes.map((a) => a.valor_total)), pacotes: soma(doMes.flatMap((a) => a.acerto_itens.map((i) => i.quantidade))) }
  const amostrasMes = soma((amostras.data ?? []).filter((a) => a.entregue_em >= inicioDoMes()).flatMap((a) => a.amostra_itens.map((i) => i.quantidade)))
  const emAberto = (prospectos.data ?? []).filter((p) => p.status === 'novo' || p.status === 'em_conversa').length

  if (produtos.isPending || saldosRep.isPending || carregando) return <Carregando />

  const primeiroNome = perfil?.nome.split(' ')[0]

  return (
    <div className="space-y-6">
      <Titulo>Olá, {primeiroNome}.</Titulo>
      {ehGestao && PainelGestao()}
      {meuRepresentanteId && MinhaRota()}
      {papel === 'producao' && PainelProducao()}
    </div>
  )

  // ── Gestão: dinheiro a entrar, dinheiro a sair e pendências ──
  function PainelGestao() {
    const pendentes = (acertos.data ?? []).filter((a) => a.status === 'pendente')
    const comComprovante = pendentes.filter((a) => a.comprovante_path)
    const aPagar = (comissoes.data ?? []).filter((c) => c.status === 'pendente')
    const vencidas = aPagar.filter((c) => c.vencimento <= hoje())
    const proximo = aPagar.map((c) => c.vencimento).sort()[0]
    const aguardando = (perfis.data ?? []).filter((p) => !p.ativo)
    const ativas = resumo.filter((r) => r.loja.status === 'ativa')

    return (
      <section className="space-y-3">
        {meuRepresentanteId && <Rotulo>Gestão</Rotulo>}

        {aguardando.length > 0 && (
          <Cartao className="border-ouro bg-ouro/10">
            <p className="text-sm font-semibold">
              {aguardando.length === 1 ? 'Uma pessoa aguarda' : `${aguardando.length} pessoas aguardam`} liberação de acesso.
            </p>
            <div className="mt-3">
              <BotaoLink para="/mais/equipe" variante="secundario">
                Ver equipe
              </BotaoLink>
            </div>
          </Cartao>
        )}

        {insumosEmFalta.length > 0 && (
          <Cartao className="border-alerta/40 bg-alerta/8">
            <p className="text-sm font-semibold">
              {insumosEmFalta.length === 1 ? 'Uma matéria-prima precisa' : `${insumosEmFalta.length} matérias-primas precisam`} de compra.
            </p>
            <p className="mt-1 text-xs text-marrom/70">{insumosEmFalta.map((i) => i.nome).join(' · ')}</p>
            <div className="mt-3">
              <BotaoLink para="/mais/insumos" variante="secundario">
                Ver matérias-primas
              </BotaoLink>
            </div>
          </Cartao>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Cartao>
            <Rotulo>A receber das lojas</Rotulo>
            <p className="mt-2 text-2xl font-bold">{reais(soma(pendentes.map((a) => a.valor_total)))}</p>
            <p className="text-xs text-marrom/65">
              {pendentes.length} {pendentes.length === 1 ? 'acerto' : 'acertos'}
              {comComprovante.length > 0 && ` · ${comComprovante.length} com comprovante para conferir`}
            </p>
          </Cartao>
          <Cartao className={vencidas.length > 0 ? 'border-alerta/40' : ''}>
            <Rotulo>A pagar a representantes</Rotulo>
            <p className="mt-2 text-2xl font-bold">{reais(soma(aPagar.map((c) => c.valor)))}</p>
            <p className="text-xs text-marrom/65">
              {vencidas.length > 0 ? `${reais(soma(vencidas.map((c) => c.valor)))} já venceu` : proximo ? `vence em ${data(proximo)}` : 'nada pendente'}
            </p>
          </Cartao>
          <Cartao>
            <Rotulo>Lojas ativas</Rotulo>
            <p className="mt-2 text-3xl font-bold">{ativas.length}</p>
            <p className="text-xs text-marrom/65">
              {pacotes(soma(ativas.map((r) => r.total)))} nas lojas · {ativas.filter((r) => r.precisaRepor).length} para repor
            </p>
          </Cartao>
          <Cartao>
            <Rotulo>Com representantes</Rotulo>
            <p className="mt-2 text-3xl font-bold">{soma((saldosRep.data ?? []).map((s) => s.saldo))}</p>
            <p className="text-xs text-marrom/65">pacotes retirados, fora de loja</p>
          </Cartao>
          <Cartao>
            <Rotulo>Varejo no mês</Rotulo>
            <p className="mt-2 text-2xl font-bold">{reais(varejoMes.valor)}</p>
            <p className="text-xs text-marrom/65">{pacotes(varejoMes.pacotes)} vendidos na rua</p>
          </Cartao>
          <Cartao>
            <Rotulo>Amostras no mês</Rotulo>
            <p className="mt-2 text-3xl font-bold">{amostrasMes}</p>
            <p className="text-xs text-marrom/65">{emAberto} {emAberto === 1 ? 'potencial cliente' : 'potenciais clientes'} em aberto</p>
          </Cartao>
        </div>
        <BotaoLink para="/financeiro" variante="secundario" cheio>
          Abrir financeiro
        </BotaoLink>
      </section>
    )
  }

  // ── Quem faz visita: onde ir, o que tem na mão e quanto vai receber ──
  function MinhaRota() {
    const minhas = resumo.filter((r) => r.loja.representante_id === meuRepresentanteId && r.loja.status === 'ativa')
    const repor = minhas.filter((r) => r.precisaRepor).sort(porUrgencia)
    const meuEstoque = (produtos.data ?? []).map((p) => ({
      nome: p.nome_curto,
      quantidade: (saldosRep.data ?? []).find((s) => s.representante_id === meuRepresentanteId && s.produto_id === p.id)?.saldo ?? 0,
    }))
    const minhasComissoes = (comissoes.data ?? []).filter((c) => c.representante_id === meuRepresentanteId && c.status === 'pendente')
    const proximo = minhasComissoes.map((c) => c.vencimento).sort()[0]
    const meusPendentes = (acertos.data ?? []).filter((a) => a.status === 'pendente' && a.representante_id === meuRepresentanteId)
    const lojasDevem = meusPendentes.filter((a) => a.modalidade !== 'varejo')
    const varejoARepassar = soma(meusPendentes.filter((a) => a.modalidade === 'varejo').map((a) => a.valor_total))

    return (
      <section className="space-y-3">
        {ehGestao && <Rotulo>Suas visitas</Rotulo>}

        <Cartao>
          <Rotulo>Seu estoque</Rotulo>
          <div className="mt-3">
            <SaldoPorProduto itens={meuEstoque} />
          </div>
        </Cartao>

        <div className="grid grid-cols-2 gap-3">
          <Cartao>
            <Rotulo>Lojas devem</Rotulo>
            <p className="mt-2 text-2xl font-bold">{reais(soma(lojasDevem.map((a) => a.valor_total)))}</p>
            <p className="text-xs text-marrom/65">
              {lojasDevem.length} {lojasDevem.length === 1 ? 'acerto' : 'acertos'} sem Pix confirmado
            </p>
          </Cartao>
          <Cartao>
            <Rotulo>Você recebe</Rotulo>
            <p className="mt-2 text-2xl font-bold">{reais(soma(minhasComissoes.map((c) => c.valor)))}</p>
            <p className="text-xs text-marrom/65">{proximo ? `próximo pagamento em ${data(proximo)}` : 'sem comissão a receber'}</p>
          </Cartao>
        </div>

        <div className="space-y-2.5">
          <p className="text-sm font-semibold">
            {minhas.length === 0
              ? 'Você ainda não tem lojas. Cadastre a primeira em Lojas.'
              : repor.length === 0
              ? 'Suas lojas estão abastecidas.'
              : `${repor.length} ${repor.length === 1 ? 'loja precisa' : 'lojas precisam'} de reposição.`}
          </p>
          {repor.slice(0, 5).map((r) => (
            <CartaoLoja key={r.loja.id} resumo={r} />
          ))}
        </div>

        {varejoARepassar > 0 && (
          <Cartao className="border-ouro bg-ouro/10">
            <Rotulo>Varejo a repassar</Rotulo>
            <p className="mt-1 text-2xl font-bold">{reais(varejoARepassar)}</p>
            <p className="text-xs text-marrom/70">Vendas na rua lançadas e ainda sem confirmação de que o dinheiro chegou à Viva Noz.</p>
          </Cartao>
        )}

        <BotaoLink para="/lojas" cheio>
          Ver lojas e registrar visita
        </BotaoLink>
        <div className="grid grid-cols-2 gap-3">
          <BotaoLink para="/varejo" variante="secundario">
            Venda varejo
          </BotaoLink>
          <BotaoLink para="/potenciais" variante="secundario">
            Amostras
          </BotaoLink>
        </div>
      </section>
    )
  }

  function PainelProducao() {
    return (
      <Cartao>
        <Rotulo>Com os representantes</Rotulo>
        <p className="mt-2 text-3xl font-bold">{soma((saldosRep.data ?? []).map((s) => s.saldo))}</p>
        <p className="text-xs text-marrom/65">pacotes retirados e ainda não colocados em loja</p>
        <div className="mt-3">
          <BotaoLink para="/estoque" variante="secundario">
            Ver estoque e registrar retirada
          </BotaoLink>
        </div>
      </Cartao>
    )
  }
}
