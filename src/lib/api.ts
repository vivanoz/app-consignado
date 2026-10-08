// Leitura e escrita no Supabase. A leitura vai direto nas tabelas (o banco
// filtra pelo perfil de quem está logado); a escrita de estoque, visita e
// pagamento passa sempre pelas funções do banco.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type {
  Acerto,
  ItemVisitaEnvio,
  Loja,
  Movimentacao,
  Perfil,
  Preco,
  Produto,
  Representante,
  ResultadoVisita,
  SaldoLoja,
  SaldoRepresentante,
  Visita,
} from './tipos'

async function ler<T>(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await consulta
  if (error) throw error
  return data as T
}

export const useProdutos = () =>
  useQuery({
    queryKey: ['produtos'],
    staleTime: 10 * 60_000,
    queryFn: () => ler<Produto[]>(supabase.from('produtos').select('*').order('ordem')),
  })

export const usePrecos = (ativo = true) =>
  useQuery({
    queryKey: ['precos'],
    enabled: ativo,
    queryFn: () => ler<Preco[]>(supabase.from('precos').select('*').order('vigente_desde', { ascending: false })),
  })

export const useRepresentantes = () =>
  useQuery({
    queryKey: ['representantes'],
    queryFn: () => ler<Representante[]>(supabase.from('representantes').select('*').order('nome')),
  })

export const usePerfis = () =>
  useQuery({
    queryKey: ['perfis'],
    queryFn: () => ler<Perfil[]>(supabase.from('perfis').select('*').order('nome')),
  })

export const useLojas = (ativo = true) =>
  useQuery({
    queryKey: ['lojas'],
    enabled: ativo,
    queryFn: () => ler<Loja[]>(supabase.from('lojas').select('*').order('nome')),
  })

export const useLoja = (id: string | undefined) =>
  useQuery({
    queryKey: ['lojas', id],
    enabled: Boolean(id),
    queryFn: () => ler<Loja | null>(supabase.from('lojas').select('*').eq('id', id!).maybeSingle()),
  })

export const useSaldosLoja = (ativo = true) =>
  useQuery({
    queryKey: ['saldos-loja'],
    enabled: ativo,
    queryFn: () => ler<SaldoLoja[]>(supabase.from('saldos_loja').select('*')),
  })

export const useSaldosRepresentante = () =>
  useQuery({
    queryKey: ['saldos-representante'],
    queryFn: () => ler<SaldoRepresentante[]>(supabase.from('saldos_representante').select('*')),
  })

export const useVisitas = (lojaId: string | undefined) =>
  useQuery({
    queryKey: ['visitas', lojaId],
    enabled: Boolean(lojaId),
    queryFn: () =>
      ler<Visita[]>(
        supabase
          .from('visitas')
          .select('*, visita_itens(*)')
          .eq('loja_id', lojaId!)
          .order('realizada_em', { ascending: false })
          .limit(30),
      ),
  })

export const useAcertos = (ativo = true) =>
  useQuery({
    queryKey: ['acertos'],
    enabled: ativo,
    queryFn: () =>
      ler<Acerto[]>(
        supabase
          .from('acertos')
          .select('*, acerto_itens(*), pagamentos(recebido_em, valor)')
          .order('criado_em', { ascending: false })
          .limit(300),
      ).then((acertos) =>
        // pagamentos é 1:1 com acerto; o Supabase devolve objeto ou nulo.
        acertos.map((a) => ({ ...a, pagamentos: [a.pagamentos ?? []].flat() })),
      ),
  })

export const useMovimentacoes = (representanteId: string | null | undefined) =>
  useQuery({
    queryKey: ['movimentacoes', representanteId],
    enabled: Boolean(representanteId),
    queryFn: () =>
      ler<Movimentacao[]>(
        supabase
          .from('movimentacoes')
          .select('*')
          .eq('representante_id', representanteId!)
          .or('origem.eq.representante,destino.eq.representante')
          .order('ocorrido_em', { ascending: false })
          .limit(60),
      ),
  })

// Toda escrita muda saldos e listas em vários lugares; recarregar tudo é
// barato neste volume e evita tela desatualizada.
function useEscrita<Entrada, Saida>(acao: (entrada: Entrada) => Promise<Saida>) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: acao,
    retry: false,
    onSuccess: () => cache.invalidateQueries(),
  })
}

const chamar = <T,>(funcao: string, argumentos: Record<string, unknown>) =>
  ler<T>(supabase.rpc(funcao, argumentos))

export const useRegistrarVisita = () =>
  useEscrita((v: { id: string; lojaId: string; itens: ItemVisitaEnvio[]; observacoes: string }) =>
    chamar<ResultadoVisita>('registrar_visita', {
      p_id: v.id,
      p_loja_id: v.lojaId,
      p_itens: v.itens,
      p_observacoes: v.observacoes || null,
    }),
  )

export const useMovimentarEstoque = () =>
  useEscrita(
    (m: {
      tipo: 'retirada' | 'devolucao'
      operacaoId: string
      representanteId: string
      itens: { produto_id: string; quantidade: number }[]
      observacao: string
    }) =>
      chamar(m.tipo === 'retirada' ? 'registrar_retirada' : 'registrar_devolucao', {
        p_operacao_id: m.operacaoId,
        p_representante_id: m.representanteId,
        p_itens: m.itens,
        p_observacao: m.observacao || null,
      }),
  )

export const useConfirmarPagamento = () =>
  useEscrita((p: { acertoId: string; valor: number; recebidoEm: string }) =>
    chamar('confirmar_pagamento', { p_acerto_id: p.acertoId, p_valor: p.valor, p_recebido_em: p.recebidoEm }),
  )

export const useEstornarVisita = () =>
  useEscrita((e: { visitaId: string; motivo: string }) =>
    chamar('estornar_visita', { p_visita_id: e.visitaId, p_motivo: e.motivo }),
  )

export const useSalvarLoja = () =>
  useEscrita(async (loja: Partial<Loja>) => {
    const { id, ...campos } = loja
    return id
      ? ler<Loja>(supabase.from('lojas').update(campos).eq('id', id).select().single())
      : ler<Loja>(supabase.from('lojas').insert(campos).select().single())
  })

export const useSalvarPreco = () =>
  useEscrita((preco: Omit<Preco, 'id'>) => ler(supabase.from('precos').insert(preco)))

export const useSalvarPerfil = () =>
  useEscrita((p: Pick<Perfil, 'id'> & Partial<Pick<Perfil, 'papel' | 'ativo' | 'nome'>>) => {
    const { id, ...campos } = p
    return ler(supabase.from('perfis').update(campos).eq('id', id))
  })

export const useSalvarRepresentante = () =>
  useEscrita(async (r: Partial<Representante>) => {
    const { id, ...campos } = r
    if (id) return ler(supabase.from('representantes').update(campos).eq('id', id))
    const novo = await ler<Representante>(supabase.from('representantes').insert(campos).select().single())
    // Condições padrão do combinado: 15% consignado, 12% compra direta, bônus de R$ 30.
    await ler(supabase.from('representante_condicoes').insert({ representante_id: novo.id }))
    return novo
  })
