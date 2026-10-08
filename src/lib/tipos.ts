// Espelho das tabelas do Supabase (supabase/migrations).

export type Papel = 'gestao' | 'producao' | 'representante'
export type Modalidade = 'kit_teste' | 'consignado' | 'compra_direta'
export type LojaStatus = 'ativa' | 'pausada' | 'encerrada'
export type AcertoStatus = 'pendente' | 'confirmado' | 'cancelado'

export interface Perfil {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  papel: Papel
  ativo: boolean
  criado_em: string
}

export interface Produto {
  id: string
  sku: string
  nome: string
  nome_curto: string
  ordem: number
  ativo: boolean
}

export interface Preco {
  id: string
  produto_id: string
  modalidade: Exclude<Modalidade, 'kit_teste'>
  preco_loja: number
  preco_sugerido: number | null
  vigente_desde: string
}

export interface Representante {
  id: string
  perfil_id: string | null
  nome: string
  telefone: string | null
  territorio: string | null
  ativo: boolean
}

export interface Loja {
  id: string
  nome: string
  segmento: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string
  uf: string
  contato_nome: string | null
  contato_telefone: string | null
  representante_id: string
  modalidade: Modalidade
  status: LojaStatus
  data_abertura: string
  observacoes: string | null
}

export interface Saldo {
  produto_id: string
  saldo: number
}
export interface SaldoLoja extends Saldo {
  loja_id: string
}
export interface SaldoRepresentante extends Saldo {
  representante_id: string
}

export interface VisitaItem {
  produto_id: string
  saldo_anterior: number
  encontrado: number
  recolhido: number
  baixado: number
  reposto: number
  vendido: number
  saldo_final: number
}

export interface Visita {
  id: string
  loja_id: string
  representante_id: string
  modalidade: Modalidade
  realizada_em: string
  observacoes: string | null
  estornada_em: string | null
  estorno_motivo: string | null
  visita_itens: VisitaItem[]
}

export interface AcertoItem {
  produto_id: string
  quantidade: number
  preco_unitario: number
  subtotal: number
}

export interface Acerto {
  id: string
  visita_id: string
  loja_id: string
  representante_id: string
  modalidade: Modalidade
  valor_total: number
  status: AcertoStatus
  criado_em: string
  confirmado_em: string | null
  acerto_itens: AcertoItem[]
  pagamentos: { recebido_em: string; valor: number }[]
}

export interface Movimentacao {
  id: string
  tipo: string
  produto_id: string
  quantidade: number
  origem: string
  destino: string
  representante_id: string | null
  loja_id: string | null
  motivo: string | null
  ocorrido_em: string
}

export interface ItemVisitaEnvio {
  produto_id: string
  encontrado: number
  recolhido: number
  baixado: number
  reposto: number
}

export interface ResultadoVisita {
  visita_id: string
  acerto_id: string | null
  valor_total: number
  repetida: boolean
}
