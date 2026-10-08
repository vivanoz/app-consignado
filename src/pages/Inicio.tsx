import { BotaoLink, Cartao, Carregando, Rotulo, SaldoPorProduto, Titulo } from '../components/ui'
import { useAcertos, useLojas, usePerfis, useProdutos, useSaldosLoja, useSaldosRepresentante } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { pacotes, reais } from '../lib/formato'

export function Inicio() {
  const { perfil, papel, ehGestao, meuRepresentanteId } = useAcesso()
  const comLojas = papel !== 'producao'
  const produtos = useProdutos()
  const lojas = useLojas(comLojas)
  const saldosLoja = useSaldosLoja(comLojas)
  const saldosRep = useSaldosRepresentante()
  const acertos = useAcertos(comLojas)
  const perfis = usePerfis()

  if (produtos.isPending || saldosRep.isPending) return <Carregando />

  const primeiroNome = perfil?.nome.split(' ')[0]
  const ativas = (lojas.data ?? []).filter((l) => l.status === 'ativa')
  const pendentes = (acertos.data ?? []).filter((a) => a.status === 'pendente')
  const aReceber = pendentes.reduce((soma, a) => soma + Number(a.valor_total), 0)
  const nasLojas = (saldosLoja.data ?? []).reduce((soma, s) => soma + s.saldo, 0)
  const comRepresentantes = (saldosRep.data ?? []).reduce((soma, s) => soma + s.saldo, 0)
  const aguardando = ehGestao ? (perfis.data ?? []).filter((p) => !p.ativo) : []

  const meuEstoque = (produtos.data ?? []).map((p) => ({
    nome: p.nome_curto,
    quantidade: (saldosRep.data ?? []).find((s) => s.representante_id === meuRepresentanteId && s.produto_id === p.id)?.saldo ?? 0,
  }))

  return (
    <div className="space-y-4">
      <Titulo>Olá, {primeiroNome}.</Titulo>

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

      {meuRepresentanteId && (
        <Cartao>
          <Rotulo>Seu estoque</Rotulo>
          <div className="mt-3">
            <SaldoPorProduto itens={meuEstoque} />
          </div>
        </Cartao>
      )}

      {comLojas && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Cartao>
              <Rotulo>Lojas ativas</Rotulo>
              <p className="mt-2 text-3xl font-bold">{ativas.length}</p>
              <p className="text-xs text-marrom/65">{pacotes(nasLojas)} nas lojas</p>
            </Cartao>
            <Cartao>
              <Rotulo>A receber das lojas</Rotulo>
              <p className="mt-2 text-2xl font-bold">{reais(aReceber)}</p>
              <p className="text-xs text-marrom/65">
                {pendentes.length} {pendentes.length === 1 ? 'acerto pendente' : 'acertos pendentes'}
              </p>
            </Cartao>
          </div>
          <BotaoLink para="/lojas" cheio>
            Registrar visita
          </BotaoLink>
        </>
      )}

      {papel !== 'representante' && (
        <Cartao>
          <Rotulo>Com os representantes</Rotulo>
          <p className="mt-2 text-3xl font-bold">{comRepresentantes}</p>
          <p className="text-xs text-marrom/65">pacotes retirados e ainda não colocados em loja</p>
          <div className="mt-3">
            <BotaoLink para="/estoque" variante="secundario">
              Ver estoque e registrar retirada
            </BotaoLink>
          </div>
        </Cartao>
      )}
    </div>
  )
}
