import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useEmpresa, useProdutos, useRepresentantes } from '../lib/api'
import { desenharResumo, mensagemDoResumo, paraJpeg, paraPdf, type DadosDoResumo } from '../lib/documentoVisita'
import { linkWhatsApp, soDigitos } from '../lib/formato'
import { mensagemDeErro, supabase } from '../lib/supabase'
import type { Acerto, Loja, Visita } from '../lib/tipos'
import { Aviso, Botao, Cartao, Rotulo } from './ui'

const TRINTA_DIAS = 60 * 60 * 24 * 30

// Resumo de uma visita para o responsável pela loja: um documento de uma
// página e a mensagem pronta para o WhatsApp.
//
// O documento é preparado assim que a tela abre, porque o navegador do
// celular só deixa abrir o WhatsApp no instante do toque: se a geração
// começasse no toque, a abertura seria bloqueada.
export function ResumoVisita({ visitaId }: { visitaId: string }) {
  const produtos = useProdutos()
  const representantes = useRepresentantes()
  const empresa = useEmpresa()
  const [erroAoCompartilhar, setErroAoCompartilhar] = useState('')

  const pronto = Boolean(produtos.data && representantes.data && empresa.isFetched)
  const resumo = useQuery({
    // A chave Pix entra na chave do cache: se ela mudar, o documento é refeito.
    queryKey: ['resumo-visita', visitaId, empresa.data?.pix_chave ?? ''],
    enabled: pronto,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const [visita, acerto] = await Promise.all([
        supabase.from('visitas').select('*, visita_itens(*)').eq('id', visitaId).single(),
        supabase.from('acertos').select('*, acerto_itens(*)').eq('visita_id', visitaId).neq('status', 'cancelado').maybeSingle(),
      ])
      if (visita.error) throw visita.error
      const v = visita.data as Visita
      const a = acerto.data as Acerto | null
      const loja = await supabase.from('lojas').select('*').eq('id', v.loja_id).single()
      if (loja.error) throw loja.error
      const l = loja.data as Loja

      const nome = (id: string) => produtos.data!.find((p) => p.id === id)
      const ordem = (id: string) => nome(id)?.ordem ?? 0
      const dados: DadosDoResumo = {
        loja: {
          nome: l.nome,
          endereco: [[l.endereco, l.numero].filter(Boolean).join(', '), l.bairro, `${l.cidade}/${l.uf}`].filter(Boolean).join(' · '),
          contato: l.contato_nome,
        },
        representante: representantes.data!.find((r) => r.id === v.representante_id)?.nome ?? 'Viva Noz',
        modalidade: v.modalidade,
        realizadaEm: v.realizada_em,
        observacoes: v.observacoes,
        itens: [...v.visita_itens]
          .sort((x, y) => ordem(x.produto_id) - ordem(y.produto_id))
          .map((i) => ({
            produto: nome(i.produto_id)?.nome ?? '?',
            tinha: i.saldo_anterior,
            vendido: i.vendido,
            recolhido: i.recolhido,
            baixado: i.baixado,
            reposto: i.reposto,
            fica: i.saldo_final,
          })),
        cobranca: [...(a?.acerto_itens ?? [])]
          .sort((x, y) => ordem(x.produto_id) - ordem(y.produto_id))
          .map((i) => ({ produto: nome(i.produto_id)?.nome ?? '?', quantidade: i.quantidade, preco: Number(i.preco_unitario), subtotal: Number(i.subtotal) })),
        total: Number(a?.valor_total ?? 0),
        pago: a?.status === 'confirmado',
        pix: { chave: empresa.data?.pix_chave ?? null, favorecido: empresa.data?.pix_favorecido ?? null, banco: empresa.data?.pix_banco ?? null },
      }

      const tela = await desenharResumo(dados)
      const jpeg = await paraJpeg(tela)
      const pdf = await paraPdf(jpeg, tela.width, tela.height)
      const arquivo = new File([pdf], `Viva Noz - ${l.nome} - ${v.realizada_em.slice(0, 10)}.pdf`, { type: 'application/pdf' })

      // Uma cópia fica guardada para a mensagem levar um link. O nome muda
      // com a chave Pix e com a situação do pagamento, para nunca reaproveitar
      // um documento desatualizado. Sem internet, segue sem link.
      let link: string | null = null
      try {
        const marca = `${soDigitos(dados.pix.chave ?? '').slice(-6) || 'sem-pix'}-${dados.pago ? 'pago' : 'aberto'}`
        const caminho = `visitas/${visitaId}/resumo-${marca}.jpg`
        const envio = await supabase.storage.from('fotos').upload(caminho, jpeg, { contentType: 'image/jpeg' })
        if (envio.error && !/exists|duplicate/i.test(envio.error.message)) throw envio.error
        const assinado = await supabase.storage.from('fotos').createSignedUrl(caminho, TRINTA_DIAS)
        link = assinado.data?.signedUrl ?? null
      } catch {
        link = null
      }

      return { dados, arquivo, previa: URL.createObjectURL(jpeg), link, telefone: l.contato_telefone, contato: l.contato_nome }
    },
  })

  if (!pronto || resumo.isPending) {
    return (
      <Cartao>
        <p className="text-sm text-marrom/70">Preparando o resumo da visita.</p>
      </Cartao>
    )
  }
  if (resumo.error) return <Aviso erro={resumo.error} />

  const { dados, arquivo, previa, link, telefone, contato } = resumo.data
  const mensagem = mensagemDoResumo(dados, link)
  const podeAnexar = typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] })

  async function compartilhar() {
    setErroAoCompartilhar('')
    try {
      if (podeAnexar) {
        await navigator.share({ files: [arquivo], text: mensagemDoResumo(dados, null) })
      } else {
        const atalho = document.createElement('a')
        atalho.href = URL.createObjectURL(arquivo)
        atalho.download = arquivo.name
        atalho.click()
      }
    } catch (e) {
      // Fechar a janela de compartilhar não é erro.
      if ((e as Error).name !== 'AbortError') setErroAoCompartilhar(mensagemDeErro(e))
    }
  }

  return (
    <Cartao className="space-y-3">
      <Rotulo>Resumo para a loja</Rotulo>
      <img src={previa} alt="Prévia do resumo da visita" className="w-full rounded-xl border border-linha" />

      {telefone ? (
        <a
          href={linkWhatsApp(telefone, mensagem)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-verde px-5 text-[15px] font-semibold text-creme active:bg-profundo"
        >
          Enviar para {contato?.split(' ')[0] ?? 'a loja'} no WhatsApp
        </a>
      ) : (
        <p className="rounded-xl border border-ouro bg-ouro/10 px-4 py-3 text-sm">Esta loja está sem WhatsApp do contato. Edite o cadastro para enviar direto.</p>
      )}
      {telefone && (
        <p className="text-xs text-marrom/65">
          Abre a conversa com a mensagem pronta{link ? ' e o link do documento' : ''}. É só tocar em enviar.
        </p>
      )}

      <Botao variante="secundario" cheio onClick={compartilhar}>
        {podeAnexar ? 'Compartilhar o PDF anexado' : 'Baixar o PDF'}
      </Botao>
      {podeAnexar && <p className="text-xs text-marrom/65">Abre o compartilhamento do celular com o PDF anexado. Escolha o WhatsApp e o contato.</p>}
      {erroAoCompartilhar && <Aviso>{erroAoCompartilhar}</Aviso>}
    </Cartao>
  )
}
