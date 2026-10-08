import type { Modalidade, Papel, Preco } from './tipos'

const FUSO = 'America/Sao_Paulo'

export const reais = (valor: number) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const data = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

export const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

// Data de hoje em Maringá, no formato AAAA-MM-DD.
export const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: FUSO })

export const pacotes = (n: number) => `${n} ${n === 1 ? 'pacote' : 'pacotes'}`

export const NOME_MODALIDADE: Record<Modalidade, string> = {
  kit_teste: 'Kit Teste',
  consignado: 'Consignado',
  compra_direta: 'Compra direta',
  varejo: 'Venda varejo',
}

export const MODALIDADES_DE_LOJA = ['kit_teste', 'consignado', 'compra_direta'] as const

export const NOME_PAPEL: Record<Papel, string> = {
  gestao: 'Gestão',
  producao: 'Produção',
  representante: 'Representante',
}

export const NOME_MOVIMENTO: Record<string, string> = {
  producao: 'Produção',
  retirada: 'Retirada na fábrica',
  devolucao: 'Devolução à fábrica',
  reposicao: 'Reposição na loja',
  recolhimento: 'Recolhido da loja',
  venda: 'Venda na loja',
  venda_direta: 'Compra direta',
  venda_varejo: 'Venda varejo',
  amostra: 'Amostra',
  baixa: 'Baixa',
  ajuste: 'Ajuste de contagem',
  estorno: 'Estorno',
}

// Preço que a loja paga hoje, por produto. Kit Teste usa o do consignado.
// O valor que vale de verdade é o que o banco grava no acerto.
export function precoVigente(precos: Preco[], produtoId: string, modalidade: Modalidade, dia = hoje()) {
  const alvo = modalidade === 'kit_teste' ? 'consignado' : modalidade
  return precos
    .filter((p) => p.produto_id === produtoId && p.modalidade === alvo && p.vigente_desde <= dia)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]
}

export const soDigitos = (texto: string) => texto.replace(/\D/g, '')

export function linkWhatsApp(telefone: string | null, mensagem: string) {
  let numero = soDigitos(telefone ?? '')
  if (numero && !numero.startsWith('55')) numero = `55${numero}`
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

// Uma loja em consignação precisa de reposição quando algum sabor em linha
// está com este número de pacotes ou menos.
export const REPOR_ATE = 3

export const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

export const haQuanto = (iso: string | undefined) => {
  if (!iso) return 'nunca visitada'
  const dias = diasDesde(iso)
  return dias === 0 ? 'visitada hoje' : dias === 1 ? 'visitada ontem' : `visitada há ${dias} dias`
}

export const porcento = (fracao: number) => `${(Number(fracao) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

export const NOME_PROSPECTO: Record<string, string> = {
  novo: 'Novo',
  em_conversa: 'Em conversa',
  virou_loja: 'Virou loja',
  descartado: 'Descartado',
}

// Primeiro dia do mês corrente em Maringá (AAAA-MM-01).
export const inicioDoMes = () => `${hoje().slice(0, 7)}-01`

// Quantidade de insumo para leitura: gramas viram kg a partir de 1 kg.
export function quantidadeInsumo(valor: number, unidade: 'g' | 'un') {
  const n = Number(valor)
  if (unidade === 'un') return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un`
  return Math.abs(n) >= 1000
    ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`
    : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} g`
}

// Na digitação, castanha é em kg e embalagem em unidades.
export const UNIDADE_DE_COMPRA = { g: 'kg', un: 'un' } as const
export const paraUnidadeBase = (valor: number, unidade: 'g' | 'un') => (unidade === 'g' ? valor * 1000 : valor)
export const daUnidadeBase = (valor: number, unidade: 'g' | 'un') => (unidade === 'g' ? Number(valor) / 1000 : Number(valor))

export const NOME_CANAL: Record<string, string> = {
  todos: 'Sempre',
  loja: 'Só loja (consignado e direto)',
  varejo: 'Só varejo',
}
