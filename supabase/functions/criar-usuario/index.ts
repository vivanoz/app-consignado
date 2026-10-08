// Gestão cria um usuário já liberado, com perfil e senha provisória.
// Roda no servidor porque criar login exige a chave de serviço, que nunca
// vai para o app. Só atende quem está logado e é gestão ativa.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const PAPEIS = ['gestao', 'producao', 'representante']
const fracao = (valor: unknown, padrao: number) => {
  const n = Number(valor)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : padrao
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ erro: 'Método não aceito.' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: quem } = await admin.auth.getUser(token)
  if (!quem?.user) return responder({ erro: 'Entre no app de novo e repita.' }, 401)

  const { data: eu } = await admin.from('perfis').select('papel, ativo').eq('id', quem.user.id).maybeSingle()
  if (!eu?.ativo || eu.papel !== 'gestao') return responder({ erro: 'Só a gestão cria usuários.' }, 403)

  let dados: Record<string, unknown>
  try {
    dados = await req.json()
  } catch {
    return responder({ erro: 'Pedido inválido.' }, 400)
  }

  const nome = String(dados.nome ?? '').trim()
  const email = String(dados.email ?? '').trim().toLowerCase()
  const senha = String(dados.senha ?? '')
  const papel = String(dados.papel ?? '')
  const telefone = String(dados.telefone ?? '').trim() || null
  // Quem é da gestão e também faz visitas ganha um cadastro de representante.
  const fazVisitas = papel === 'representante' || dados.faz_visitas === true
  // Representante já cadastrado, ainda sem login: o acesso é ligado a ele.
  const existenteId = typeof dados.representante_id === 'string' && dados.representante_id ? dados.representante_id : null

  if (!nome) return responder({ erro: 'Informe o nome.' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ erro: 'E-mail inválido.' }, 400)
  if (senha.length < 8) return responder({ erro: 'A senha precisa de pelo menos 8 caracteres.' }, 400)
  if (!PAPEIS.includes(papel)) return responder({ erro: 'Perfil inválido.' }, 400)

  if (existenteId) {
    const { data: existente } = await admin.from('representantes').select('id, perfil_id').eq('id', existenteId).maybeSingle()
    if (!existente) return responder({ erro: 'Representante não encontrado.' }, 400)
    if (existente.perfil_id) return responder({ erro: 'Este representante já tem acesso ao app.' }, 400)
  }

  const { data: criado, error: erroLogin } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  })
  if (erroLogin || !criado.user) {
    const jaExiste = /already|registered|exists/i.test(erroLogin?.message ?? '')
    return responder({ erro: jaExiste ? 'Já existe uma conta com este e-mail.' : (erroLogin?.message ?? 'Não foi possível criar o login.') }, 400)
  }
  const id = criado.user.id

  // O perfil nasce pelo gatilho do banco; aqui só definimos papel e liberamos.
  const { error: erroPerfil } = await admin.from('perfis').update({ nome, telefone, papel, ativo: true }).eq('id', id)
  if (erroPerfil) return responder({ erro: `Login criado, mas o perfil não foi liberado: ${erroPerfil.message}` }, 500)

  let representanteId: string | null = null
  if (existenteId) {
    const { error: erroElo } = await admin.from('representantes').update({ perfil_id: id }).eq('id', existenteId).is('perfil_id', null)
    if (erroElo) return responder({ erro: `Usuário criado, mas não foi ligado ao representante: ${erroElo.message}` }, 500)
    representanteId = existenteId
  } else if (fazVisitas) {
    const { data: rep, error: erroRep } = await admin
      .from('representantes')
      .insert({ nome, telefone, perfil_id: id, territorio: String(dados.territorio ?? '').trim() || null })
      .select('id')
      .single()
    if (erroRep) return responder({ erro: `Usuário criado, mas o cadastro de representante falhou: ${erroRep.message}` }, 500)
    representanteId = rep.id

    const { error: erroCond } = await admin.from('representante_condicoes').insert({
      representante_id: rep.id,
      comissao_consignado: fracao(dados.comissao_consignado, 0.15),
      comissao_direta: fracao(dados.comissao_direta, 0.12),
      comissao_varejo: fracao(dados.comissao_varejo, 0.15),
      bonus_abertura: Math.max(0, Number(dados.bonus_abertura ?? 30) || 0),
      criado_por: quem.user.id,
    })
    if (erroCond) return responder({ erro: `Usuário criado, mas as condições de comissão não foram gravadas: ${erroCond.message}` }, 500)
  }

  return responder({ id, representante_id: representanteId })
})
