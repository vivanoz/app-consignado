import { useState, type FormEvent, type ReactNode } from 'react'
import { Aviso, Botao, Campo } from '../components/ui'
import { useAcesso } from '../lib/auth'
import { erroDoLink, supabase } from '../lib/supabase'

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <img src="./marca/selo-cores-sem-fundo.png" alt="Viva Noz" className="mx-auto mb-6 size-36" />
      {children}
    </div>
  )
}

type Modo = 'entrar' | 'criar' | 'senha'

// Porta de entrada: quem já tem conta entra; quem nunca entrou cria a conta;
// quem esqueceu (ou foi convidado por e-mail) recebe um link para criar a senha.
export function Entrada() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')

  const aba = (alvo: Modo, nome: string) => (
    <button
      type="button"
      onClick={() => setModo(alvo)}
      className={`min-h-11 flex-1 rounded-lg text-sm font-semibold ${modo === alvo ? 'bg-verde text-creme' : 'text-marrom/70'}`}
    >
      {nome}
    </button>
  )

  return (
    <Moldura>
      {erroDoLink && modo === 'entrar' && (
        <div className="mb-4">
          <Aviso>O link do e-mail expirou ou já foi usado. Toque em "Esqueci a senha" para receber um link novo.</Aviso>
        </div>
      )}

      {modo !== 'senha' && (
        <div className="mb-5 flex rounded-xl border border-linha bg-papel p-1">
          {aba('entrar', 'Já tenho conta')}
          {aba('criar', 'Primeiro acesso')}
        </div>
      )}

      {modo === 'entrar' && <Entrar email={email} setEmail={setEmail} aoEsquecer={() => setModo('senha')} />}
      {modo === 'criar' && <CriarConta email={email} setEmail={setEmail} aoJaTerConta={() => setModo('senha')} />}
      {modo === 'senha' && <SenhaPorEmail email={email} setEmail={setEmail} aoVoltar={() => setModo('entrar')} />}
    </Moldura>
  )
}

interface ComEmail {
  email: string
  setEmail: (v: string) => void
}

function Entrar({ email, setEmail, aoEsquecer }: ComEmail & { aoEsquecer: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) setErro(error)
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <Campo rotulo="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Campo rotulo="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
      <Aviso erro={erro} />
      <Botao type="submit" cheio disabled={enviando}>
        {enviando ? 'Entrando.' : 'Entrar'}
      </Botao>
      <div className="text-center">
        <Botao variante="discreto" onClick={aoEsquecer}>
          Esqueci a senha
        </Botao>
      </div>
    </form>
  )
}

function CriarConta({ email, setEmail, aoJaTerConta }: ComEmail & { aoJaTerConta: () => void }) {
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<unknown>(null)
  const [jaExiste, setJaExiste] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setJaExiste(false)
    setEnviando(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: { data: { nome: nome.trim() } },
    })
    setEnviando(false)
    if (!error) return // já entra logado; a tela seguinte avisa que falta a liberação
    if (/already registered|already been registered|user_already_exists/i.test(error.message + (error.code ?? ''))) setJaExiste(true)
    else setErro(error)
  }

  return (
    <form onSubmit={criar} className="space-y-4">
      <p className="text-sm text-marrom/75">
        Crie sua conta com seu e-mail e uma senha. Depois, a gestão da Viva Noz libera o seu acesso.
      </p>
      <Campo rotulo="Seu nome" autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} />
      <Campo rotulo="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Campo rotulo="Crie uma senha (mínimo de 8 caracteres)" type="password" autoComplete="new-password" minLength={8} required value={senha} onChange={(e) => setSenha(e.target.value)} />
      <Aviso erro={erro} />
      {jaExiste && (
        <Aviso>
          Este e-mail já tem cadastro. Se você nunca criou uma senha ou esqueceu, defina uma agora.
        </Aviso>
      )}
      {jaExiste ? (
        <Botao cheio onClick={aoJaTerConta}>
          Definir minha senha
        </Botao>
      ) : (
        <Botao type="submit" cheio disabled={enviando}>
          {enviando ? 'Criando.' : 'Criar conta'}
        </Botao>
      )}
    </form>
  )
}

// Quem esqueceu a senha, ou foi convidado e nunca criou uma, recebe um link
// por e-mail. O link abre o app já na tela de criar a senha.
function SenhaPorEmail({ email, setEmail, aoVoltar }: ComEmail & { aoVoltar: () => void }) {
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)

  async function pedir(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + window.location.pathname,
    })
    setEnviando(false)
    if (error) {
      return setErro(
        /rate limit|security purposes/i.test(error.message)
          ? 'Muitos pedidos em pouco tempo. Espere alguns minutos e tente de novo, ou use o último e-mail que chegou.'
          : error,
      )
    }
    setEnviado(true)
  }

  if (enviado) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-serif text-2xl font-semibold">Veja seu e-mail.</p>
        <p className="text-sm text-marrom/75">
          Se <strong>{email.trim()}</strong> tiver cadastro, chegou um e-mail com um link. Abra o link neste mesmo aparelho: ele traz você de volta ao app para criar a senha. Vale por 24 horas e só funciona uma vez. Confira também o spam.
        </p>
        <Botao variante="secundario" cheio onClick={aoVoltar}>
          Voltar para o início
        </Botao>
      </div>
    )
  }

  return (
    <form onSubmit={pedir} className="space-y-4">
      <p className="text-center font-serif text-2xl font-semibold">Criar uma senha nova.</p>
      <p className="text-sm text-marrom/75">Informe seu e-mail. Enviamos um link para você criar uma senha nova.</p>
      <Campo rotulo="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Aviso erro={erro} />
      <Botao type="submit" cheio disabled={enviando}>
        {enviando ? 'Enviando.' : 'Enviar link por e-mail'}
      </Botao>
      <div className="text-center">
        <Botao variante="discreto" onClick={aoVoltar}>
          Voltar
        </Botao>
      </div>
    </form>
  )
}

// Quem chega por um link de e-mail ainda válido cai aqui.
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
        <p className="font-serif text-2xl font-semibold">Conta criada. Falta a liberação.</p>
        <p className="text-sm text-marrom/75">
          {perfil?.nome ? `${perfil.nome}, sua` : 'Sua'} conta está pronta, mas ainda não enxerga nada. Avise a gestão da Viva Noz para liberar o seu acesso. Depois é só abrir o app de novo.
        </p>
        <Botao cheio onClick={() => window.location.reload()}>
          Já fui liberado
        </Botao>
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
