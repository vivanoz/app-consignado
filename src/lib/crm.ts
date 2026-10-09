// Funil de vendas da Viva Noz: cinco etapas, do primeiro registro ao cliente.
import { hoje } from './formato'
import type { ProspectoStatus } from './tipos'

export const ETAPAS: { id: ProspectoStatus; nome: string; explica: string }[] = [
  { id: 'novo', nome: 'Novo lead', explica: 'Registrado, ainda sem contato.' },
  { id: 'em_conversa', nome: 'Em contato', explica: 'Já houve conversa com o responsável.' },
  { id: 'amostra', nome: 'Amostra entregue', explica: 'Recebeu amostra e está avaliando.' },
  { id: 'negociacao', nome: 'Negociando', explica: 'Discutindo modalidade, sabores e início.' },
  { id: 'virou_loja', nome: 'Cliente', explica: 'Fechou e virou loja.' },
]

export const NOME_ETAPA: Record<ProspectoStatus, string> = {
  novo: 'Novo lead',
  em_conversa: 'Em contato',
  amostra: 'Amostra entregue',
  negociacao: 'Negociando',
  virou_loja: 'Cliente',
  descartado: 'Perdido',
}

export const TOM_ETAPA: Record<ProspectoStatus, 'neutro' | 'ouro' | 'verde' | 'alerta'> = {
  novo: 'neutro',
  em_conversa: 'ouro',
  amostra: 'ouro',
  negociacao: 'ouro',
  virou_loja: 'verde',
  descartado: 'alerta',
}

// Lead ainda em andamento no funil.
export const emAndamento = (status: ProspectoStatus) => status !== 'virou_loja' && status !== 'descartado'

export const NOME_INTERACAO: Record<string, string> = {
  visita: 'Visita',
  whatsapp: 'WhatsApp',
  ligacao: 'Ligação',
  email: 'E-mail',
  nota: 'Anotação',
}

// Em que grupo de prazo uma atividade aberta cai.
export function prazo(venceEm: string): 'atrasada' | 'hoje' | 'semana' | 'depois' {
  const dia = hoje()
  if (venceEm < dia) return 'atrasada'
  if (venceEm === dia) return 'hoje'
  const emSeteDias = new Date(`${dia}T12:00:00`)
  emSeteDias.setDate(emSeteDias.getDate() + 7)
  return venceEm <= emSeteDias.toISOString().slice(0, 10) ? 'semana' : 'depois'
}

export function diasAte(venceEm: string) {
  return Math.round((new Date(`${venceEm}T12:00:00`).getTime() - new Date(`${hoje()}T12:00:00`).getTime()) / 86_400_000)
}

export function quando(venceEm: string) {
  const dias = diasAte(venceEm)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  return dias < 0 ? `há ${-dias} dias` : `em ${dias} dias`
}

// Data daqui a N dias, em Maringá (AAAA-MM-DD).
export function daquiA(dias: number) {
  const d = new Date(`${hoje()}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}
