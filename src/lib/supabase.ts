import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configurado = Boolean(url && chave)

// Convite e redefinição de senha chegam com o token no endereço. Guardamos
// isso antes de o cliente do Supabase limpar a URL, para pedir a nova senha.
export const chegouPorLink = /type=(invite|recovery)/.test(window.location.hash)
// Link vencido ou já usado volta com o erro no endereço.
export const erroDoLink = /error(_code|_description)?=/.test(window.location.hash + window.location.search)

export const supabase = createClient(url ?? 'http://localhost', chave ?? 'sem-chave')

// Mensagem legível de um erro do Supabase. As funções do banco já respondem
// em português; o resto é falha de rede ou de permissão.
export function mensagemDeErro(erro: unknown): string {
  const texto = erro && typeof erro === 'object' && 'message' in erro ? String(erro.message) : String(erro)
  if (/failed to fetch|networkerror|load failed/i.test(texto)) {
    return 'Sem conexão com a internet. Nada foi perdido: tente de novo quando o sinal voltar.'
  }
  if (/row-level security|permission denied/i.test(texto)) return 'Você não tem permissão para fazer isso.'
  if (/invalid login credentials/i.test(texto)) return 'E-mail ou senha incorretos.'
  if (/duplicate key/i.test(texto)) return 'Já existe um registro igual a este.'
  return texto
}
