import { useRef, useState, type ReactNode } from 'react'
import { abrirArquivo, enviarArquivo, useUrlArquivo, type Espaco, type Pasta } from '../lib/arquivos'
import { mensagemDeErro } from '../lib/supabase'

// Foto de um registro. Sem foto, mostra as iniciais sobre a cor da marca.
export function Foto({
  caminho,
  nome,
  formato = 'redonda',
  className = '',
}: {
  caminho: string | null | undefined
  nome: string
  formato?: 'redonda' | 'quadrada' | 'capa'
  className?: string
}) {
  const url = useUrlArquivo('fotos', caminho)
  const forma = { redonda: 'rounded-full', quadrada: 'rounded-xl', capa: 'rounded-2xl' }[formato]
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

  return url.data ? (
    <img src={url.data} alt={nome} loading="lazy" className={`${forma} bg-areia/40 object-cover ${className}`} />
  ) : (
    <div aria-hidden className={`${forma} grid place-items-center bg-areia/50 font-serif text-xl font-semibold text-marrom/70 ${className}`}>
      {iniciais}
    </div>
  )
}

// Botão que abre a câmera ou a galeria, envia o arquivo e devolve o caminho.
export function EnviarArquivo({
  espaco,
  pasta,
  id,
  aoEnviar,
  children,
  aceitaPdf = false,
  variante = 'secundario',
}: {
  espaco: Espaco
  pasta: Pasta
  id: string
  aoEnviar: (caminho: string) => void | Promise<unknown>
  children: ReactNode
  aceitaPdf?: boolean
  variante?: 'secundario' | 'discreto'
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setErro('')
    setEnviando(true)
    try {
      await aoEnviar(await enviarArquivo(espaco, pasta, id, arquivo))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  const estilo =
    variante === 'secundario'
      ? 'inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-marrom/30 px-5 text-[15px] font-semibold active:bg-marrom/5'
      : 'inline-flex min-h-10 items-center text-sm font-semibold text-verde underline underline-offset-4'

  return (
    <div>
      <input
        ref={entrada}
        type="file"
        accept={aceitaPdf ? 'image/*,application/pdf' : 'image/*'}
        className="hidden"
        onChange={(e) => escolher(e.target.files?.[0])}
      />
      <button type="button" disabled={enviando} onClick={() => entrada.current?.click()} className={`${estilo} disabled:opacity-50`}>
        {enviando ? 'Enviando.' : children}
      </button>
      {erro && <p role="alert" className="mt-1 text-xs font-medium text-alerta">{erro}</p>}
    </div>
  )
}

export function VerArquivo({ espaco, caminho, children }: { espaco: Espaco; caminho: string; children: ReactNode }) {
  const [erro, setErro] = useState('')
  return (
    <span>
      <button
        type="button"
        onClick={() => abrirArquivo(espaco, caminho).catch((e) => setErro(mensagemDeErro(e)))}
        className="inline-flex min-h-10 items-center text-sm font-semibold text-verde underline underline-offset-4"
      >
        {children}
      </button>
      {erro && <span role="alert" className="ml-2 text-xs text-alerta">{erro}</span>}
    </span>
  )
}
