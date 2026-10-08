import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { mensagemDeErro } from '../lib/supabase'

const ESTILO_BOTAO = {
  primario: 'bg-verde text-creme active:bg-profundo',
  secundario: 'border border-marrom/30 text-marrom active:bg-marrom/5',
  discreto: 'text-verde underline underline-offset-4',
}

type Variante = keyof typeof ESTILO_BOTAO

const baseBotao = (variante: Variante, cheio: boolean) =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition disabled:opacity-50 ${ESTILO_BOTAO[variante]} ${cheio ? 'w-full' : ''}`

export function Botao({
  variante = 'primario',
  cheio = false,
  className = '',
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cheio?: boolean }) {
  return <button type="button" {...resto} className={`${baseBotao(variante, cheio)} ${className}`} />
}

export function BotaoLink({
  para,
  variante = 'primario',
  cheio = false,
  children,
}: {
  para: string
  variante?: Variante
  cheio?: boolean
  children: ReactNode
}) {
  const externo = para.startsWith('http')
  return externo ? (
    <a href={para} target="_blank" rel="noreferrer" className={baseBotao(variante, cheio)}>
      {children}
    </a>
  ) : (
    <Link to={para} className={baseBotao(variante, cheio)}>
      {children}
    </Link>
  )
}

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-linha bg-papel p-4 ${className}`}>{children}</section>
}

export function Titulo({ children, apoio }: { children: ReactNode; apoio?: ReactNode }) {
  return (
    <header className="mb-4">
      <h1 className="font-serif text-[32px] leading-tight font-semibold">{children}</h1>
      {apoio && <p className="mt-1 text-sm text-marrom/70">{apoio}</p>}
    </header>
  )
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold tracking-[0.14em] text-verde uppercase">{children}</p>
}

const CAMPO =
  'mt-1 block min-h-12 w-full rounded-xl border border-marrom/25 bg-white/70 px-3 text-base text-marrom placeholder:text-marrom/35'

export function Campo({ rotulo, ...resto }: InputHTMLAttributes<HTMLInputElement> & { rotulo: string }) {
  return (
    <label className="block text-sm font-semibold">
      {rotulo}
      <input {...resto} className={CAMPO} />
    </label>
  )
}

export function Selecao({
  rotulo,
  children,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string }) {
  return (
    <label className="block text-sm font-semibold">
      {rotulo}
      <select {...resto} className={CAMPO}>
        {children}
      </select>
    </label>
  )
}

export function AreaDeTexto({
  rotulo,
  valor,
  aoMudar,
  dica,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  dica?: string
}) {
  return (
    <label className="block text-sm font-semibold">
      {rotulo}
      <textarea
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={dica}
        rows={2}
        className={`${CAMPO} py-3`}
      />
    </label>
  )
}

// Contador de pacotes para usar com o polegar: botões grandes de menos e mais.
export function Contador({
  rotulo,
  valor,
  aoMudar,
  maximo,
  apoio,
}: {
  rotulo: string
  valor: number
  aoMudar: (v: number) => void
  maximo?: number
  apoio?: ReactNode
}) {
  const limitar = (n: number) => Math.max(0, Math.min(maximo ?? 9999, Number.isFinite(n) ? Math.trunc(n) : 0))
  const botao =
    'grid size-12 shrink-0 place-items-center rounded-xl border border-marrom/25 bg-white/70 text-2xl leading-none font-semibold active:bg-areia/50 disabled:opacity-30'
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">{rotulo}</p>
        {apoio && <p className="text-xs text-marrom/65">{apoio}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Menos em ${rotulo}`} className={botao} disabled={valor <= 0} onClick={() => aoMudar(limitar(valor - 1))}>
          −
        </button>
        <input
          aria-label={rotulo}
          inputMode="numeric"
          pattern="[0-9]*"
          value={valor}
          onFocus={(e) => e.target.select()}
          onChange={(e) => aoMudar(limitar(Number(e.target.value.replace(/\D/g, ''))))}
          className="h-12 w-14 rounded-xl border border-marrom/25 bg-white/70 text-center text-xl font-bold"
        />
        <button
          type="button"
          aria-label={`Mais em ${rotulo}`}
          className={botao}
          disabled={maximo !== undefined && valor >= maximo}
          onClick={() => aoMudar(limitar(valor + 1))}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function Etiqueta({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'verde' | 'ouro' | 'alerta' }) {
  const cores = {
    neutro: 'bg-marrom/8 text-marrom/80',
    verde: 'bg-verde/15 text-verde',
    ouro: 'bg-ouro/20 text-marrom',
    alerta: 'bg-alerta/12 text-alerta',
  }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cores[tom]}`}>{children}</span>
}

export function Aviso({ erro, children }: { erro?: unknown; children?: ReactNode }) {
  if (!erro && !children) return null
  return (
    <p role="alert" className="rounded-xl border border-alerta/30 bg-alerta/8 px-4 py-3 text-sm font-medium text-alerta">
      {children ?? mensagemDeErro(erro)}
    </p>
  )
}

export function Carregando() {
  return <p className="py-10 text-center text-sm text-marrom/60">Carregando.</p>
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-marrom/25 px-4 py-8 text-center text-sm text-marrom/65">{children}</p>
}

// Lista "Mix 10 · Caramelizada 7 · Caju com Sal 3".
export function SaldoPorProduto({ itens }: { itens: { nome: string; quantidade: number }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {itens.map((i) => (
        <div key={i.nome} className="rounded-xl bg-creme px-2 py-2.5 text-center">
          <dd className="text-2xl leading-none font-bold">{i.quantidade}</dd>
          <dt className="mt-1 text-[11px] leading-tight font-semibold text-marrom/70">{i.nome}</dt>
        </div>
      ))}
    </dl>
  )
}
