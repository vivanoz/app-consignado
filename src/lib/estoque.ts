// Estoque de quem vai repor, vender ou entregar amostra.
//
// Para o representante, vale só o que ele retirou. Para quem é da gestão e
// também vende (a fábrica é dela), vale também o que está na fábrica: o app
// lança a retirada sozinho, do que faltar, na hora de gravar.
import { useRef } from 'react'
import { useMovimentarEstoque, useSaldosFabrica, useSaldosRepresentante } from './api'
import { useAcesso } from './auth'

export function useEstoqueDeQuemVende(representanteId: string | null | undefined) {
  const { ehGestao, meuRepresentanteId } = useAcesso()
  const saldos = useSaldosRepresentante()
  // Só quando a própria pessoa da gestão é quem está vendendo.
  const direto = ehGestao && Boolean(representanteId) && representanteId === meuRepresentanteId
  const fabrica = useSaldosFabrica(direto)
  const movimentar = useMovimentarEstoque()
  const retiradaId = useRef(crypto.randomUUID())

  const emMaos = (produtoId: string) =>
    saldos.data?.find((s) => s.representante_id === representanteId && s.produto_id === produtoId)?.saldo ?? 0
  const naFabrica = (produtoId: string) =>
    direto ? Math.max(0, fabrica.data?.find((s) => s.produto_id === produtoId)?.saldo ?? 0) : 0

  return {
    direto,
    carregando: saldos.isPending || (direto && fabrica.isPending),
    // Chave para recalcular telas quando os saldos mudam.
    versao: `${saldos.dataUpdatedAt}-${fabrica.dataUpdatedAt}`,
    emMaos,
    disponivel: (produtoId: string) => emMaos(produtoId) + naFabrica(produtoId),
    // Antes de gravar: tira da fábrica o que falta em mãos.
    async garantir(itens: { produto_id: string; quantidade: number }[]) {
      if (!direto || !representanteId) return
      const faltas = itens
        .map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade - emMaos(i.produto_id) }))
        .filter((i) => i.quantidade > 0)
      if (faltas.length === 0) return
      await movimentar.mutateAsync({ tipo: 'retirada', operacaoId: retiradaId.current, representanteId, itens: faltas, observacao: 'Direto da fábrica' })
      retiradaId.current = crypto.randomUUID()
    },
  }
}
