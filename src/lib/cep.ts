// Busca de endereço no ViaCEP (serviço público e gratuito, base dos Correios).
// Só o CEP ou o nome da rua saem do aparelho; nenhum dado da loja é enviado.

export interface Endereco {
  cep: string
  endereco: string
  bairro: string
  cidade: string
  uf: string
  // Trecho da rua a que o CEP se refere, quando a rua tem mais de um CEP.
  trecho: string
}

interface RespostaViaCep {
  erro?: boolean | string
  cep: string
  logradouro: string
  complemento: string
  unidade: string
  bairro: string
  localidade: string
  uf: string
}

const ler = (r: RespostaViaCep): Endereco => ({
  cep: r.cep.replace(/\D/g, ''),
  endereco: r.logradouro,
  bairro: r.bairro,
  cidade: r.localidade,
  uf: r.uf,
  trecho: [r.unidade, r.complemento].filter(Boolean).join(' · '),
})

async function consultar<T>(caminho: string, sinal?: AbortSignal): Promise<T> {
  const resposta = await fetch(`https://viacep.com.br/ws/${caminho}/json/`, { signal: sinal })
  if (!resposta.ok) throw new Error('A busca de endereço não respondeu. Preencha à mão.')
  return resposta.json()
}

export const formatarCep = (texto: string) => {
  const d = texto.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

// Devolve nulo quando o CEP não existe.
export async function buscarPorCep(cep: string, sinal?: AbortSignal): Promise<Endereco | null> {
  const r = await consultar<RespostaViaCep>(cep.replace(/\D/g, ''), sinal)
  return r.erro ? null : ler(r)
}

// Ruas da cidade que contêm o termo (mínimo de 3 letras, regra do ViaCEP).
export async function buscarPorRua(uf: string, cidade: string, termo: string, sinal?: AbortSignal): Promise<Endereco[]> {
  const buscar = async (texto: string) => {
    const r = await consultar<RespostaViaCep[]>([uf, cidade, texto].map((p) => encodeURIComponent(p.trim())).join('/'), sinal)
    return Array.isArray(r) ? r.filter((x) => x.logradouro).map(ler) : []
  }
  // O ViaCEP procura o texto exato dentro do nome oficial. Quem digita "Av.
  // Bento Munhoz da Rocha Neto" não acha "Avenida Bento Munhoz da Rocha
  // Netto", então a busca tira o tipo da via e, sem resultado, tenta só com
  // as primeiras palavras.
  const palavras = termo
    .trim()
    .replace(/^(av|avenida|r|rua|pç|pc|praça|praca|trav|travessa|al|alameda|rod|rodovia|estr|estrada)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
  if (palavras.join(' ').length < 3) return []
  const completos = await buscar(palavras.join(' '))
  if (completos.length > 0 || palavras.length <= 2) return completos
  return buscar(palavras.slice(0, 2).join(' '))
}
