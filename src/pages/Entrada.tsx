import { useState, type FormEvent, type ReactNode } from 'react'
import { Aviso, Botao, Campo } from '../components/ui'
import { useAcesso } from '../lib/auth'
import { supabase } from '../lib/supabase'

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <img src="./marca/selo-cores-sem-fundo.png" alt="Viva Noz" className="mx-auto mb-6 size-40" />
      {children}
    </div>
  )
}

export function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [recado, setRecado] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setRecado('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) setErro(error)
  }

  async function esqueci() {
    setErro(null)
    if (!email.trim()) return setErro('Digite seu e-mail acima e toque de novo em "Esqueci a senha".')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + window.location.pathname,
    })
    if (error) setErro(error)
    else setRecado('Se este e-mail tiver cadastro, enviamos um link para criar uma nova senha.')
  }

  return (
    <Moldura>
      <form onSubmit={entrar} className="space-y-4">
        <Campo rotulo="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo rotulo="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Aviso erro={erro} />
        {recado && <p className="text-sm text-verde">{recado}</p>}
        <Botao type="submit" cheio disabled={enviando}>
          {enviando ? 'Entrando.' : 'Entrar'}
        </Botao>
        <div className="text-center">
          <Botao variante="discreto" onClick={esqueci}>
            Esqueci a senha
          </Botao>
        </div>
      </form>
    </Moldura>
  )
}

export function DefinirSenha() {
  const { senhaDefinida } = useAcesso()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) setErro(error)
    else senhaDefinida()
  }

  return (
    <Moldura>
      <form onSubmit={salvar} className="space-y-4">
        <p className="text-center font-serif text-2xl font-semibold">Crie sua senha.</p>
        <Campo rotulo="Nova senha (mínimo de 8 caracteres)" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Aviso erro={erro} />
        <Botao type="submit" cheio disabled={enviando}>
          Salvar e entrar
        </Botao>
      </form>
    </Moldura>
  )
}

export function SemAcesso() {
  const { perfil, sair } = useAcesso()
  return (
    <Moldura>
      <div className="space-y-4 text-center">
        <p className="font-serif text-2xl font-semibold">Seu acesso ainda não foi liberado.</p>
        <p className="text-sm text-marrom/75">
          {perfil?.nome ? `${perfil.nome}, seu` : 'Seu'} cadastro foi criado. Falta a gestão da Viva Noz liberar o seu perfil. Avise o time e entre de novo depois.
        </p>
        <Botao variante="secundario" cheio onClick={sair}>
          Sair
        </Botao>
      </div>
    </Moldura>
  )
}

export function SemConfiguracao() {
  return (
    <Moldura>
      <div className="space-y-3 text-center">
        <p className="font-serif text-2xl font-semibold">Falta ligar o app ao banco de dados.</p>
        <p className="text-sm text-marrom/75">
          Crie o arquivo <code>.env.local</code> com o endereço e a chave pública do projeto Supabase da Viva Noz. O modelo está em <code>.env.example</code>.
        </p>
      </div>
    </Moldura>
  )
}
