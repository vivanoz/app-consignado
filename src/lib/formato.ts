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
}

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
