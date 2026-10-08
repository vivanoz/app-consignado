import { useState } from 'react'
import { AreaDeTexto, Aviso, BotaoLink, Cartao, Carregando, Contador, Campo, Rotulo, Selecao, Titulo } from '../components/ui'
import { usePrecos, useProdutos, useRegistrarVendaVarejo, useRepresentantes, useSaldosRepresentante } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { useEstoqueDeQuemVende } from '../lib/estoque'
import { hoje, pacotes, precoVigente, reais } from '../lib/formato'

// Venda direta ao consumidor, na rua. No fim do dia a pessoa informa quantos
// pacotes de cada sabor vendeu; o faturamento sai pelo preço médio de varejo.
export function VendaVarejo() {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const produtos = useProdutos()
  const precos = usePrecos()
  const representantes = useRepresentantes()
  const saldos = useSaldosRepresentante()
  const registrar = useRegistrarVendaVarejo()

  // Criado uma vez por venda: reenviar por internet ruim não duplica.
  const [vendaId] = useState(() => crypto.randomUUID())
  const [representanteId, setRepresentanteId] = useState(meuRepresentanteId ?? '')
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [vendidaEm, setVendidaEm] = useState(hoje())
  const [observacoes, setObservacoes] = useState('')
  const [feita, setFeita] = useState<{ valor: number; pacotes: number } | null>(null)
  const estoque = useEstoqueDeQuemVende(representanteId)
  const [erroRetirada, setErroRetirada] = useState<unknown>(null)

  if (produtos.isPending || saldos.isPending || precos.isPending) return <Carregando />

  const linhas = (produtos.data ?? [])
    .map((p) => ({
      produto: p,
      tem: estoque.disponivel(p.id),
      preco: precoVigente(precos.data ?? [], p.id, 'varejo', vendidaEm)?.preco_loja,
      vendeu: quantidades[p.id] ?? 0,
    }))
    .filter((x) => x.produto.ativo || x.tem > 0)

  const total = linhas.reduce((s, x) => s + x.vendeu, 0)
  const valor = linhas.reduce((s, x) => s + x.vendeu * Number(x.preco ?? 0), 0)
  const semPreco = linhas.filter((x) => x.preco === undefined)
  const semEstoque = Boolean(representanteId) && linhas.every((x) => x.tem === 0)
  const quem = representanteId === meuRepresentanteId ? 'Você' : (representantes.data?.find((r) => r.id === representanteId)?.nome ?? '')

  async function enviar() {
    setErroRetirada(null)
    const itens = linhas.filter((x) => x.vendeu > 0).map((x) => ({ produto_id: x.produto.id, quantidade: x.vendeu }))
    try {
      await estoque.garantir(itens)
    } catch (e) {
      return setErroRetirada(e)
    }
    const r = await registrar.mutateAsync({
      id: vendaId,
      representanteId,
      itens,
      vendidaEm,
      observacoes,
    })
    setFeita({ valor: Number(r.valor_total), pacotes: total })
  }

  if (feita) {
    return (
      <div className="space-y-4">
        <Titulo>Venda registrada.</Titulo>
        <Cartao className="border-ouro bg-ouro/10">
          <Rotulo>Faturamento do varejo</Rotulo>
          <p className="mt-1 text-4xl font-bold">{reais(feita.valor)}</p>
          <p className="mt-2 text-sm text-marrom/75">
            {pacotes(feita.pacotes)} saíram do estoque. O valor fica em Financeiro como "a receber" até a gestão confirmar que o dinheiro chegou à Viva Noz.
          </p>
        </Cartao>
        <BotaoLink para="/" cheio>
          Voltar ao início
        </BotaoLink>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Titulo apoio="Informe quantos pacotes de cada sabor foram vendidos na rua.">Venda varejo</Titulo>

      {ehGestao && (
        <Selecao rotulo="Quem vendeu" value={representanteId} onChange={(e) => { setRepresentanteId(e.target.value); setQuantidades({}) }}>
          <option value="">Escolha</option>
          {representantes.data?.filter((r) => r.ativo).map((r) => (
            <option key={r.id} value={r.id}>
              {r.id === meuRepresentanteId ? `${r.nome} (você)` : r.nome}
            </option>
          ))}
        </Selecao>
      )}

      {!representanteId && !ehGestao && <Aviso>Seu usuário não está cadastrado para vender. Fale com a gestão.</Aviso>}

      {semEstoque && (
        <Cartao className="border-alerta/40 bg-alerta/8">
          <p className="font-semibold">{quem} está sem estoque no app.</p>
          <p className="mt-1 text-sm text-marrom/80">
            {estoque.direto ? 'Não há pacote pronto no app. Registre a produção em Estoque.' : 'Só dá para registrar venda do que foi retirado da fábrica.'}
          </p>
          <div className="mt-3">
            <BotaoLink para="/estoque" variante="secundario" cheio>
              Abrir estoque
            </BotaoLink>
          </div>
        </Cartao>
      )}

      {representanteId && (
        <Cartao>
          {linhas.map((x) => (
            <Contador
              key={x.produto.id}
              rotulo={x.produto.nome_curto}
              apoio={`${x.tem} ${estoque.direto ? 'com você e na fábrica' : 'no estoque'}${x.preco !== undefined ? ` · ${reais(x.preco)} cada` : ' · sem preço de varejo'}`}
              valor={x.vendeu}
              maximo={x.tem}
              aoMudar={(n) => setQuantidades((q) => ({ ...q, [x.produto.id]: n }))}
            />
          ))}
        </Cartao>
      )}

      <Campo rotulo="Dia da venda" type="date" max={hoje()} value={vendidaEm} onChange={(e) => setVendidaEm(e.target.value)} />
      <AreaDeTexto rotulo="Observações" valor={observacoes} aoMudar={setObservacoes} dica="Opcional. Onde vendeu, como foi o dia." />

      {semPreco.length > 0 && <Aviso>Falta preço de varejo para {semPreco.map((x) => x.produto.nome_curto).join(', ')}. A gestão cadastra em Mais, Tabela de preços.</Aviso>}
      <Aviso erro={erroRetirada ?? registrar.error} />

      <div className="sticky bottom-[72px] rounded-2xl border border-linha bg-profundo p-4 text-creme shadow-lg">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-creme/70">{pacotes(total)} vendidos · preço médio</p>
            <p className="text-3xl font-bold">{reais(valor)}</p>
          </div>
          <button
            type="button"
            disabled={total === 0 || !vendidaEm || semPreco.some((x) => x.vendeu > 0) || registrar.isPending}
            onClick={enviar}
            className="min-h-12 rounded-xl bg-creme px-5 text-[15px] font-bold text-profundo disabled:opacity-40"
          >
            {registrar.isPending ? 'Gravando.' : 'Gravar venda'}
          </button>
        </div>
      </div>
    </div>
  )
}
