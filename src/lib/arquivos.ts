// Fotos e comprovantes no Storage do Supabase. Os espaços são privados: o
// app pede um endereço temporário para mostrar cada arquivo, e o banco só
// entrega para quem enxerga o registro a que o arquivo pertence.
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export type Espaco = 'fotos' | 'comprovantes'
export type Pasta = 'representantes' | 'lojas' | 'visitas' | 'acertos' | 'repasses'

const LADO_MAXIMO = 1600

// Reduz a foto no aparelho antes de enviar: foto de celular tem vários MB e o
// representante costuma estar no 4G.
async function reduzir(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith('image/')) return arquivo
  try {
    const imagem = await createImageBitmap(arquivo)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height))
    const tela = document.createElement('canvas')
    tela.width = Math.round(imagem.width * escala)
    tela.height = Math.round(imagem.height * escala)
    tela.getContext('2d')!.drawImage(imagem, 0, 0, tela.width, tela.height)
    const reduzida = await new Promise<Blob | null>((pronto) => tela.toBlob(pronto, 'image/jpeg', 0.82))
    return reduzida ?? arquivo
  } catch {
    return arquivo
  }
}

// Envia e devolve o caminho a gravar no registro. Cada envio é um arquivo
// novo; nada é sobrescrito.
export async function enviarArquivo(espaco: Espaco, pasta: Pasta, id: string, arquivo: File): Promise<string> {
  const conteudo = await reduzir(arquivo)
  const extensao = conteudo.type === 'application/pdf' ? 'pdf' : conteudo.type === 'image/png' ? 'png' : conteudo.type === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `${pasta}/${id}/${Date.now()}.${extensao}`
  const { error } = await supabase.storage.from(espaco).upload(caminho, conteudo, { contentType: conteudo.type || 'image/jpeg' })
  if (error) throw error
  return caminho
}

export const useUrlArquivo = (espaco: Espaco, caminho: string | null | undefined) =>
  useQuery({
    queryKey: ['arquivo', espaco, caminho],
    enabled: Boolean(caminho),
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(espaco).createSignedUrl(caminho!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })

export async function abrirArquivo(espaco: Espaco, caminho: string) {
  // A janela abre antes da espera para o navegador do celular não bloquear.
  const janela = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(espaco).createSignedUrl(caminho, 600)
  if (error || !data) {
    janela?.close()
    throw error ?? new Error('Não foi possível abrir o arquivo.')
  }
  if (janela) janela.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}
