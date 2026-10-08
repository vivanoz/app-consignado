// Situação de cada loja, juntando cadastro, saldo e última visita.
import { useMemo } from 'react'
import { useLojas, useProdutos, useSaldosLoja, useUltimasVisitas } from './api'
import { REPOR_ATE, diasDesde } from './formato'
import type { Loja } from './tipos'

export interface ResumoLoja {
  loja: Loja
  saldos: { nome: string; quantidade: number }[]
  total: number
  ultimaVisita: string | undefined
  // Em consignação, ativa, e com algum sabor em linha quase no fim (ou nunca abastecida).
  precisaRepor: boolean
}

export function useResumoLojas(ativo = true) {
  const lojas = useLojas(ativo)
  const produtos = useProdutos()
  const saldos = useSaldosLoja(ativo)
  const visitas = useUltimasVisitas(ativo)

  const resumo = useMemo<ResumoLoja[]>(() => {
    if (!lojas.data || !produtos.data) return []
    return lojas.data.map((loja) => {
      const porProduto = produtos.data.map((p) => ({
        nome: p.nome_curto,
        ativo: p.ativo,
        quantidade: saldos.data?.find((s) => s.loja_id === loja.id && s.produto_id === p.id)?.saldo ?? 0,
      }))
      const consignada = loja.status === 'ativa' && loja.modalidade !== 'compra_direta'
      return {
        loja,
        saldos: porProduto.filter((p) => p.ativo || p.quantidade > 0),
        total: porProduto.reduce((soma, p) => soma + p.quantidade, 0),
        ultimaVisita: visitas.data?.find((v) => v.loja_id === loja.id)?.ultima_visita,
        precisaRepor: consignada && porProduto.some((p) => p.ativo && p.quantidade <= REPOR_ATE),
      }
    })
  }, [lojas.data, produtos.data, saldos.data, visitas.data])

  return { resumo, carregando: ativo && (lojas.isPending || produtos.isPending), erro: lojas.error }
}

// Quem precisa de reposição primeiro; entre iguais, quem está há mais tempo sem visita.
export const porUrgencia = (a: ResumoLoja, b: ResumoLoja) =>
  Number(b.precisaRepor) - Number(a.precisaRepor) ||
  (b.ultimaVisita ? diasDesde(b.ultimaVisita) : 9999) - (a.ultimaVisita ? diasDesde(a.ultimaVisita) : 9999) ||
  a.loja.nome.localeCompare(b.loja.nome)
