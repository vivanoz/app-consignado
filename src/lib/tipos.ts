// Espelho das tabelas do Supabase (supabase/migrations).

export type Papel = 'gestao' | 'producao' | 'representante'
export type Modalidade = 'kit_teste' | 'consignado' | 'compra_direta' | 'varejo'
// Modalidades em que uma loja pode estar (varejo é venda na rua, sem loja).
export type ModalidadeLoja = Exclude<Modalidade, 'varejo'>
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
  foto_path: string | null
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
  foto_path: string | null
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
  foto_path: string | null
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
  // Acerto de loja tem visita e loja; acerto de venda varejo tem só a venda.
  visita_id: string | null
  loja_id: string | null
  venda_varejo_id: string | null
  representante_id: string
  modalidade: Modalidade
  valor_total: number
  status: AcertoStatus
  criado_em: string
  confirmado_em: string | null
  comprovante_path: string | null
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

export interface Comissao {
  id: string
  representante_id: string
  tipo: 'comissao' | 'bonus_abertura'
  acerto_id: string
  loja_id: string | null
  base: number | null
  percentual: number | null
  valor: number
  recebido_em: string
  vencimento: string
  status: 'pendente' | 'paga'
  repasse_id: string | null
}

export interface Repasse {
  id: string
  representante_id: string
  valor_total: number
  pago_em: string
  comprovante_path: string | null
  observacao: string | null
}

export interface UltimaVisita {
  loja_id: string
  ultima_visita: string
  visitas: number
}

export interface Condicao {
  representante_id: string
  comissao_consignado: number
  comissao_direta: number
  comissao_varejo: number
  bonus_abertura: number
  vigente_desde: string
}

export type ProspectoStatus = 'novo' | 'em_conversa' | 'virou_loja' | 'descartado'

export interface Prospecto {
  id: string
  nome: string
  segmento: string | null
  endereco: string | null
  bairro: string | null
  cidade: string
  contato_nome: string | null
  contato_telefone: string | null
  representante_id: string
  status: ProspectoStatus
  loja_id: string | null
  observacoes: string | null
  criado_em: string
}

export interface Amostra {
  id: string
  prospecto_id: string
  representante_id: string
  entregue_em: string
  observacoes: string | null
  amostra_itens: { produto_id: string; quantidade: number }[]
}

export type Canal = 'todos' | 'loja' | 'varejo'

export interface Fornecedor {
  id: string
  nome: string
  contato_nome: string | null
  telefone: string | null
  email: string | null
  cidade: string | null
  observacoes: string | null
  ativo: boolean
}

// Insumo com a situação do estoque (view insumos_situacao).
export interface Insumo {
  id: string
  nome: string
  unidade: 'g' | 'un'
  estoque_ideal: number
  fornecedor_id: string | null
  ordem: number
  ativo: boolean
  saldo: number
  estoque_minimo: number
  comprar: boolean
  falta_para_o_ideal: number
}

export interface Receita {
  id: string
  produto_id: string
  insumo_id: string
  canal: Canal
  quantidade: number
}

export interface Compra {
  id: string
  fornecedor_id: string | null
  comprada_em: string
  valor_frete: number
  valor_total: number
  observacoes: string | null
  compra_itens: { insumo_id: string; quantidade: number; valor: number }[]
}

export type LancamentoTipo = 'despesa' | 'imposto' | 'aporte' | 'retirada'

export interface Lancamento {
  id: string
  tipo: LancamentoTipo
  categoria: string
  descricao: string | null
  valor: number
  competencia: string
  pago_em: string | null
  cancelado_em: string | null
}
