// Leitura e escrita no Supabase. A leitura vai direto nas tabelas (o banco
// filtra pelo perfil de quem está logado); a escrita de estoque, visita e
// pagamento passa sempre pelas funções do banco.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAcesso } from './auth'
import { supabase } from './supabase'
import type {
  Acerto,
  Amostra,
  Comissao,
  Condicao,
  ItemVisitaEnvio,
  Loja,
  Movimentacao,
  Perfil,
  Preco,
  Produto,
  Prospecto,
  Repasse,
  Representante,
  ResultadoVisita,
  SaldoLoja,
  SaldoRepresentante,
  UltimaVisita,
  Visita,
} from './tipos'

async function ler<T>(consulta: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await consulta
  if (error) throw error
  return data as T
}

// Quando a gestão está vendo o app como um representante, as consultas
// trazem só o que é dele, como o banco faria para o login dele.
const useEscopo = () => useAcesso().visaoDe?.id ?? null

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

export const useRepresentantes = () => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['representantes', escopo],
    queryFn: () => {
      const consulta = supabase.from('representantes').select('*')
      return ler<Representante[]>((escopo ? consulta.eq('id', escopo) : consulta).order('nome'))
    },
  })
}

export const usePerfis = () =>
  useQuery({
    queryKey: ['perfis'],
    queryFn: () => ler<Perfil[]>(supabase.from('perfis').select('*').order('nome')),
  })

export const useLojas = (ativo = true) => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['lojas', 'lista', escopo],
    enabled: ativo,
    queryFn: () => {
      const consulta = supabase.from('lojas').select('*')
      return ler<Loja[]>((escopo ? consulta.eq('representante_id', escopo) : consulta).order('nome'))
    },
  })
}

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

export const useSaldosRepresentante = () => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['saldos-representante', escopo],
    queryFn: () => {
      const consulta = supabase.from('saldos_representante').select('*')
      return ler<SaldoRepresentante[]>(escopo ? consulta.eq('representante_id', escopo) : consulta)
    },
  })
}

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

export const useAcertos = (ativo = true) => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['acertos', escopo],
    enabled: ativo,
    queryFn: () => {
      const consulta = supabase.from('acertos').select('*, acerto_itens(*), pagamentos(recebido_em, valor)')
      return ler<Acerto[]>(
        (escopo ? consulta.eq('representante_id', escopo) : consulta).order('criado_em', { ascending: false }).limit(300),
      ).then((acertos) =>
        // pagamentos é 1:1 com acerto; o Supabase devolve objeto ou nulo.
        acertos.map((a) => ({ ...a, pagamentos: [a.pagamentos ?? []].flat() })),
      )
    },
  })
}

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
  useEscrita(async (r: Partial<Representante> & { condicao?: Partial<Condicao> }) => {
    const { id, condicao, ...campos } = r
    if (id) return ler(supabase.from('representantes').update(campos).eq('id', id))
    const novo = await ler<Representante>(supabase.from('representantes').insert(campos).select().single())
    // Sem condição informada, vale o combinado padrão: 15% consignado, 12% direta, bônus de R$ 30.
    await ler(supabase.from('representante_condicoes').insert({ ...condicao, representante_id: novo.id }))
    return novo
  })

export const useUltimasVisitas = (ativo = true) =>
  useQuery({
    queryKey: ['ultimas-visitas'],
    enabled: ativo,
    queryFn: () => ler<UltimaVisita[]>(supabase.from('lojas_ultima_visita').select('*')),
  })

export const useComissoes = (ativo = true) => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['comissoes', escopo],
    enabled: ativo,
    queryFn: () => {
      const consulta = supabase.from('comissoes').select('*')
      return ler<Comissao[]>((escopo ? consulta.eq('representante_id', escopo) : consulta).order('vencimento').limit(1000))
    },
  })
}

export const useRepasses = (ativo = true) => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['repasses', escopo],
    enabled: ativo,
    queryFn: () => {
      const consulta = supabase.from('repasses').select('*')
      return ler<Repasse[]>((escopo ? consulta.eq('representante_id', escopo) : consulta).order('pago_em', { ascending: false }).limit(200))
    },
  })
}

export const useCondicoes = (ativo = true) =>
  useQuery({
    queryKey: ['condicoes'],
    enabled: ativo,
    queryFn: () =>
      ler<Condicao[]>(
        supabase.from('representante_condicoes').select('*').order('vigente_desde', { ascending: false }).order('criado_em', { ascending: false }),
      ),
  })

export const useRegistrarRepasse = () =>
  useEscrita((r: { id: string; representanteId: string; comissaoIds: string[]; pagoEm: string; comprovantePath: string | null; observacao: string }) =>
    chamar<{ repasse_id: string; valor_total: number }>('registrar_repasse', {
      p_id: r.id,
      p_representante_id: r.representanteId,
      p_comissao_ids: r.comissaoIds,
      p_pago_em: r.pagoEm,
      p_comprovante_path: r.comprovantePath,
      p_observacao: r.observacao || null,
    }),
  )

// Liga um arquivo já enviado ao registro dele.
export const useAnexar = () =>
  useEscrita((a: { alvo: 'acerto' | 'repasse' | 'visita' | 'representante'; id: string; path: string }) => {
    const funcao = {
      acerto: ['anexar_comprovante_acerto', 'p_acerto_id'],
      repasse: ['anexar_comprovante_repasse', 'p_repasse_id'],
      visita: ['anexar_foto_visita', 'p_visita_id'],
      representante: ['definir_foto_representante', 'p_representante_id'],
    }[a.alvo]
    return chamar(funcao[0], { [funcao[1]]: a.id, p_path: a.path })
  })

export const useSalvarCondicao = () =>
  useEscrita((c: Condicao) => ler(supabase.from('representante_condicoes').insert(c)))

export interface NovoUsuario {
  nome: string
  email: string
  senha: string
  papel: string
  telefone: string
  faz_visitas: boolean
  // Liga o login a um representante já cadastrado, em vez de criar outro.
  representante_id?: string
  comissao_consignado: number
  comissao_direta: number
  comissao_varejo: number
  bonus_abertura: number
}

// Criar login exige a chave de serviço, então passa pela função do servidor.
export const useCriarUsuario = () =>
  useEscrita(async (u: NovoUsuario) => {
    const { data, error } = await supabase.functions.invoke('criar-usuario', { body: u })
    if (error) {
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      throw new Error(corpo?.erro ?? error.message)
    }
    if (data?.erro) throw new Error(data.erro)
    return data as { id: string; representante_id: string | null }
  })

// ── Produção e estoque da fábrica ──

export const useSaldosFabrica = (ativo = true) =>
  useQuery({
    queryKey: ['saldos-fabrica'],
    enabled: ativo,
    queryFn: () => ler<{ produto_id: string; saldo: number }[]>(supabase.from('saldos_fabrica').select('*')),
  })

export const useRegistrarProducao = () =>
  useEscrita(
    async (p: {
      // Um identificador por sabor: reenviar não duplica o lote.
      itens: { operacaoId: string; produtoId: string; quantidade: number }[]
      produzidoEm: string
      validade: string | null
      // Quem produz e já sai para vender leva o lote direto para o próprio estoque.
      retirar: { operacaoId: string; representanteId: string } | null
    }) => {
      for (const item of p.itens) {
        await chamar('registrar_producao', {
          p_operacao_id: item.operacaoId,
          p_produto_id: item.produtoId,
          p_quantidade: item.quantidade,
          p_produzido_em: p.produzidoEm,
          p_validade: p.validade,
        })
      }
      if (p.retirar) {
        await chamar('registrar_retirada', {
          p_operacao_id: p.retirar.operacaoId,
          p_representante_id: p.retirar.representanteId,
          p_itens: p.itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })),
          p_observacao: 'Direto da produção',
        })
      }
    },
  )

// ── Venda varejo ──

export const useRegistrarVendaVarejo = () =>
  useEscrita((v: { id: string; representanteId: string; itens: { produto_id: string; quantidade: number }[]; vendidaEm: string; observacoes: string }) =>
    chamar<{ venda_id: string; acerto_id: string; valor_total: number }>('registrar_venda_varejo', {
      p_id: v.id,
      p_representante_id: v.representanteId,
      p_itens: v.itens,
      p_vendida_em: v.vendidaEm,
      p_observacoes: v.observacoes || null,
    }),
  )

export const useEstornarVendaVarejo = () =>
  useEscrita((e: { vendaId: string; motivo: string }) => chamar('estornar_venda_varejo', { p_venda_id: e.vendaId, p_motivo: e.motivo }))

// ── Potenciais clientes e amostras ──

export const useProspectos = (ativo = true) => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['prospectos', escopo],
    enabled: ativo,
    queryFn: () => {
      const consulta = supabase.from('prospectos').select('*')
      return ler<Prospecto[]>((escopo ? consulta.eq('representante_id', escopo) : consulta).order('criado_em', { ascending: false }))
    },
  })
}

export const useAmostras = (ativo = true) => {
  const escopo = useEscopo()
  return useQuery({
    queryKey: ['amostras', escopo],
    enabled: ativo,
    queryFn: () => {
      const consulta = supabase.from('amostras').select('*, amostra_itens(produto_id, quantidade)')
      return ler<Amostra[]>((escopo ? consulta.eq('representante_id', escopo) : consulta).order('entregue_em', { ascending: false }).limit(500))
    },
  })
}

export const useSalvarProspecto = () =>
  useEscrita(async (p: Partial<Prospecto>) => {
    const { id, ...campos } = p
    return id
      ? ler<Prospecto>(supabase.from('prospectos').update(campos).eq('id', id).select().single())
      : ler<Prospecto>(supabase.from('prospectos').insert(campos).select().single())
  })

export const useRegistrarAmostra = () =>
  useEscrita((a: { id: string; prospectoId: string; itens: { produto_id: string; quantidade: number }[]; entregueEm: string; observacoes: string }) =>
    chamar<{ amostra_id: string; pacotes: number }>('registrar_amostra', {
      p_id: a.id,
      p_prospecto_id: a.prospectoId,
      p_itens: a.itens,
      p_entregue_em: a.entregueEm,
      p_observacoes: a.observacoes || null,
    }),
  )
