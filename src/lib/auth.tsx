import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { chegouPorLink, supabase } from './supabase'
import type { Papel, Perfil } from './tipos'

interface Acesso {
  carregando: boolean
  sessao: Session | null
  perfil: Perfil | null
  // Cadastro de representante ligado a este usuário, se houver.
  meuRepresentanteId: string | null
  papel: Papel | null
  ehGestao: boolean
  ehProducao: boolean
  // Gestão vendo o app como um representante veria. A sessão continua sendo
  // a da gestão: muda só o que as telas mostram.
  visaoDe: { id: string; nome: string } | null
  verComo: (representante: { id: string; nome: string } | null) => void
  precisaDefinirSenha: boolean
  senhaDefinida: () => void
  sair: () => Promise<void>
}

const Contexto = createContext<Acesso | null>(null)

export function ProvedorDeAcesso({ children }: { children: ReactNode }) {
  const cache = useQueryClient()
  const [sessao, setSessao] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [precisaDefinirSenha, setPrecisaDefinirSenha] = useState(chegouPorLink)
  const [visao, setVisao] = useState<{ id: string; nome: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setPronto(true)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, nova) => {
      setSessao(nova)
      if (evento === 'PASSWORD_RECOVERY') setPrecisaDefinirSenha(true)
      if (evento === 'SIGNED_OUT') cache.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [cache])

  const uid = sessao?.user.id ?? null

  const conta = useQuery({
    queryKey: ['minha-conta', uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const [perfil, representante] = await Promise.all([
        supabase.from('perfis').select('*').eq('id', uid!).maybeSingle(),
        supabase.from('representantes').select('id').eq('perfil_id', uid!).eq('ativo', true).maybeSingle(),
      ])
      if (perfil.error) throw perfil.error
      return { perfil: perfil.data as Perfil | null, representanteId: (representante.data?.id as string) ?? null }
    },
  })

  const perfil = conta.data?.perfil ?? null
  const papelReal = perfil?.ativo ? perfil.papel : null
  const visaoDe = papelReal === 'gestao' ? visao : null
  const papel = visaoDe ? 'representante' : papelReal

  const valor: Acesso = {
    carregando: !pronto || (Boolean(uid) && conta.isPending),
    sessao,
    perfil: perfil && visaoDe ? { ...perfil, nome: visaoDe.nome } : perfil,
    meuRepresentanteId: visaoDe ? visaoDe.id : papel ? (conta.data?.representanteId ?? null) : null,
    papel,
    ehGestao: papel === 'gestao',
    ehProducao: papel === 'producao',
    visaoDe,
    verComo: setVisao,
    precisaDefinirSenha,
    senhaDefinida: () => setPrecisaDefinirSenha(false),
    sair: async () => {
      setVisao(null)
      await supabase.auth.signOut()
    },
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useAcesso() {
  const acesso = useContext(Contexto)
  if (!acesso) throw new Error('useAcesso fora do ProvedorDeAcesso')
  return acesso
}
