// Resumo de uma visita em uma página, na identidade da Viva Noz, para mandar
// ao responsável pela loja. É desenhado no aparelho (canvas), vira uma imagem
// e um PDF de uma página. Nada depende de servidor para gerar.
import { NOME_MODALIDADE, data, reais } from './formato'
import type { Modalidade } from './tipos'

export interface DadosDoResumo {
  loja: { nome: string; endereco: string; contato: string | null }
  representante: string
  modalidade: Modalidade
  realizadaEm: string
  observacoes: string | null
  itens: { produto: string; tinha: number; vendido: number; recolhido: number; baixado: number; reposto: number; fica: number }[]
  cobranca: { produto: string; quantidade: number; preco: number; subtotal: number }[]
  total: number
  pago: boolean
  pix: { chave: string | null; favorecido: string | null; banco: string | null }
}

const COR = { marrom: '#451D08', verde: '#455020', areia: '#D1AD83', creme: '#F4EBDD', profundo: '#26351F', ouro: '#B88945', papel: '#FBF6EE' }
const SERIF = '"Cormorant Garamond", Georgia, serif'
const SANS = '"Manrope Variable", "Segoe UI", Arial, sans-serif'
// A4 a 150 pontos por polegada.
const L = 1240
const A = 1754
const MARGEM = 90

function carregarImagem(src: string) {
  return new Promise<HTMLImageElement>((ok, falha) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = falha
    img.src = src
  })
}

export async function desenharResumo(d: DadosDoResumo): Promise<HTMLCanvasElement> {
  // As fontes da marca precisam estar carregadas antes de desenhar.
  await Promise.all([document.fonts.load(`600 60px ${SERIF}`), document.fonts.load(`italic 500 30px ${SERIF}`), document.fonts.load(`700 26px ${SANS}`), document.fonts.load(`400 26px ${SANS}`)]).catch(() => {})

  const tela = document.createElement('canvas')
  tela.width = L
  tela.height = A
  const c = tela.getContext('2d')!
  const texto = (t: string, x: number, y: number, fonte: string, cor: string, alinhar: CanvasTextAlign = 'left') => {
    c.font = fonte
    c.fillStyle = cor
    c.textAlign = alinhar
    c.fillText(t, x, y)
  }
  const cabe = (t: string, largura: number, fonte: string) => {
    c.font = fonte
    if (c.measureText(t).width <= largura) return t
    let corte = t
    while (corte.length > 3 && c.measureText(`${corte}…`).width > largura) corte = corte.slice(0, -1)
    return `${corte}…`
  }
  const linha = (y: number, cor = 'rgba(69,29,8,0.18)') => {
    c.strokeStyle = cor
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(MARGEM, y)
    c.lineTo(L - MARGEM, y)
    c.stroke()
  }

  c.fillStyle = COR.creme
  c.fillRect(0, 0, L, A)

  // Cabeçalho
  c.fillStyle = COR.profundo
  c.fillRect(0, 0, L, 230)
  try {
    const selo = await carregarImagem('./marca/selo-uma-cor-creme.png')
    c.drawImage(selo, MARGEM - 10, 30, 170, 170)
  } catch {
    texto('Viva Noz', MARGEM, 130, `600 64px ${SERIF}`, COR.creme)
  }
  texto('Resumo da visita', L - MARGEM, 118, `600 64px ${SERIF}`, COR.creme, 'right')
  texto('viva a pausa.', L - MARGEM, 168, `italic 500 34px ${SERIF}`, COR.areia, 'right')

  // Loja
  let y = 320
  texto(cabe(d.loja.nome, L - 2 * MARGEM, `600 68px ${SERIF}`), MARGEM, y, `600 68px ${SERIF}`, COR.marrom)
  y += 46
  if (d.loja.endereco) {
    texto(cabe(d.loja.endereco, L - 2 * MARGEM, `400 26px ${SANS}`), MARGEM, y, `400 26px ${SANS}`, 'rgba(69,29,8,0.75)')
    y += 40
  }
  const quando = new Date(d.realizadaEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  texto(`Visita de ${quando}  ·  ${NOME_MODALIDADE[d.modalidade]}  ·  Atendido por ${d.representante}`, MARGEM, y, `600 24px ${SANS}`, COR.verde)
  y += 50

  // Movimentação
  const secao = (titulo: string) => {
    y += 30
    c.font = `700 22px ${SANS}`
    c.fillStyle = COR.verde
    c.textAlign = 'left'
    // Rótulo em caixa alta com espaçamento, como no manual da marca.
    let x = MARGEM
    for (const letra of titulo.toUpperCase()) {
      c.fillText(letra, x, y)
      x += c.measureText(letra).width + 4
    }
    y += 22
    linha(y, COR.ouro)
    y += 46
  }

  const direta = d.modalidade === 'compra_direta'
  secao('O que aconteceu nesta visita')
  const colunas = direta
    ? [{ nome: 'Entregue', de: (i: DadosDoResumo['itens'][number]) => i.reposto }]
    : [
        { nome: 'Tinha', de: (i: DadosDoResumo['itens'][number]) => i.tinha },
        { nome: 'Vendeu', de: (i: DadosDoResumo['itens'][number]) => i.vendido },
        { nome: 'Recolhido', de: (i: DadosDoResumo['itens'][number]) => i.recolhido + i.baixado },
        { nome: 'Reposto', de: (i: DadosDoResumo['itens'][number]) => i.reposto },
        { nome: 'Fica agora', de: (i: DadosDoResumo['itens'][number]) => i.fica },
      ]
  const larguraColuna = 122
  const xColuna = (n: number) => L - MARGEM - (colunas.length - 1 - n) * larguraColuna
  colunas.forEach((col, n) => texto(col.nome.toUpperCase(), xColuna(n), y, `700 18px ${SANS}`, 'rgba(69,29,8,0.6)', 'right'))
  texto('PRODUTO', MARGEM, y, `700 18px ${SANS}`, 'rgba(69,29,8,0.6)')
  y += 22
  linha(y)
  for (const item of d.itens) {
    y += 52
    const larguraNome = xColuna(0) - larguraColuna - MARGEM + 20
    texto(cabe(item.produto, larguraNome, `600 28px ${SANS}`), MARGEM, y, `600 28px ${SANS}`, COR.marrom)
    colunas.forEach((col, n) => {
      const valor = col.de(item)
      const destaque = col.nome === 'Vendeu' || col.nome === 'Fica agora' || col.nome === 'Entregue'
      texto(String(valor), xColuna(n), y, `${destaque ? 700 : 400} 30px ${SANS}`, valor === 0 && !destaque ? 'rgba(69,29,8,0.4)' : COR.marrom, 'right')
    })
    y += 22
    linha(y)
  }
  if (d.itens.some((i) => i.baixado > 0)) {
    y += 40
    const baixas = d.itens.filter((i) => i.baixado > 0).map((i) => `${i.produto} ${i.baixado}`).join(', ')
    texto(cabe(`Recolhido inclui produto vencido ou danificado, sem custo para a loja: ${baixas}.`, L - 2 * MARGEM, `400 22px ${SANS}`), MARGEM, y, `400 22px ${SANS}`, 'rgba(69,29,8,0.7)')
  }
  y += 30

  // Acerto
  secao(direta ? 'Valor desta entrega' : 'Acerto desta visita')
  if (d.cobranca.length === 0) {
    texto('Sem venda nesta visita. Não há valor a pagar.', MARGEM, y, `400 28px ${SANS}`, COR.marrom)
    y += 40
  } else {
    for (const item of d.cobranca) {
      texto(cabe(item.produto, 560, `400 28px ${SANS}`), MARGEM, y, `400 28px ${SANS}`, COR.marrom)
      texto(`${item.quantidade} x ${reais(item.preco)}`, L - MARGEM - 240, y, `400 26px ${SANS}`, 'rgba(69,29,8,0.75)', 'right')
      texto(reais(item.subtotal), L - MARGEM, y, `600 28px ${SANS}`, COR.marrom, 'right')
      y += 48
    }
    y += 6
    c.fillStyle = COR.papel
    c.strokeStyle = COR.ouro
    c.lineWidth = 3
    c.beginPath()
    c.roundRect(MARGEM, y, L - 2 * MARGEM, 130, 24)
    c.fill()
    c.stroke()
    texto(d.pago ? 'TOTAL PAGO' : 'TOTAL A PAGAR', MARGEM + 40, y + 78, `700 24px ${SANS}`, COR.verde)
    texto(reais(d.total), L - MARGEM - 40, y + 92, `700 64px ${SANS}`, COR.marrom, 'right')
    y += 180

    if (!d.pago) {
      texto('Pagamento por Pix, direto para a Viva Noz.', MARGEM, y, `600 26px ${SANS}`, COR.marrom)
      y += 42
      if (d.pix.chave) {
        texto(`Chave Pix: ${d.pix.chave}`, MARGEM, y, `700 30px ${SANS}`, COR.marrom)
        y += 42
        const quem = [d.pix.favorecido, d.pix.banco].filter(Boolean).join(' · ')
        if (quem) {
          texto(cabe(quem, L - 2 * MARGEM, `400 24px ${SANS}`), MARGEM, y, `400 24px ${SANS}`, 'rgba(69,29,8,0.75)')
          y += 40
        }
      }
      texto('O representante não recebe pagamento. Depois do Pix, envie o comprovante por aqui.', MARGEM, y, `400 22px ${SANS}`, 'rgba(69,29,8,0.7)')
      y += 30
    }
  }

  if (d.observacoes) {
    secao('Observações')
    texto(cabe(d.observacoes.replace(/\s+/g, ' '), L - 2 * MARGEM, `400 26px ${SANS}`), MARGEM, y, `400 26px ${SANS}`, COR.marrom)
  }

  // Rodapé
  linha(A - 120)
  texto('Viva Noz  ·  castanhas selecionadas  ·  Maringá/PR', MARGEM, A - 76, `600 22px ${SANS}`, COR.verde)
  texto('WhatsApp (44) 99849-6222  ·  @viva_noz', MARGEM, A - 44, `400 22px ${SANS}`, 'rgba(69,29,8,0.7)')
  texto(`Gerado em ${data(new Date().toISOString())}`, L - MARGEM, A - 44, `400 20px ${SANS}`, 'rgba(69,29,8,0.55)', 'right')

  return tela
}

export const paraJpeg = (tela: HTMLCanvasElement) =>
  new Promise<Blob>((ok, falha) => tela.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível gerar a imagem.'))), 'image/jpeg', 0.9))

// PDF de uma página A4 com a imagem ocupando a folha inteira. O formato é
// simples o bastante para montar à mão, sem biblioteca.
export async function paraPdf(jpeg: Blob, largura: number, altura: number): Promise<Blob> {
  const imagem = new Uint8Array(await jpeg.arrayBuffer())
  const codificar = (t: string) => new TextEncoder().encode(t)
  const conteudo = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q'
  const objetos: (Uint8Array | string)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'],
    [`<< /Type /XObject /Subtype /Image /Width ${largura} /Height ${altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imagem.length} >>\nstream\n`, imagem, '\nendstream'],
    [`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`],
  ]

  const partes: Uint8Array[] = [codificar('%PDF-1.4\n')]
  const posicoes: number[] = []
  let tamanho = partes[0].length
  const juntar = (p: Uint8Array) => {
    partes.push(p)
    tamanho += p.length
  }
  objetos.forEach((pedacos, i) => {
    posicoes.push(tamanho)
    juntar(codificar(`${i + 1} 0 obj\n`))
    for (const pedaco of pedacos) juntar(typeof pedaco === 'string' ? codificar(pedaco) : pedaco)
    juntar(codificar('\nendobj\n'))
  })
  const inicioDaTabela = tamanho
  juntar(
    codificar(
      `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioDaTabela}\n%%EOF`,
    ),
  )
  return new Blob(partes as BlobPart[], { type: 'application/pdf' })
}

// Mensagem pronta para o WhatsApp do responsável pela loja.
export function mensagemDoResumo(d: DadosDoResumo, link: string | null) {
  const primeiroNome = d.loja.contato?.trim().split(/\s+/)[0]
  const direta = d.modalidade === 'compra_direta'
  const lista = (titulo: string, itens: [string, number][]) => {
    const validos = itens.filter(([, n]) => n > 0)
    return validos.length === 0 ? [] : [`*${titulo}*`, ...validos.map(([nome, n]) => `• ${nome}: ${n}`), '']
  }
  return [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}. Aqui é ${d.representante}, da Viva Noz.`,
    `Segue o resumo da visita de ${data(d.realizadaEm)} na ${d.loja.nome}.`,
    '',
    ...(direta ? [] : lista('Vendido', d.itens.map((i) => [i.produto, i.vendido]))),
    ...lista(direta ? 'Entregue' : 'Reposto', d.itens.map((i) => [i.produto, i.reposto])),
    ...lista('Recolhido', d.itens.map((i) => [i.produto, i.recolhido + i.baixado])),
    ...(direta ? [] : lista('Fica na loja agora', d.itens.map((i) => [i.produto, i.fica]))),
    ...(d.cobranca.length === 0
      ? ['Sem venda nesta visita. Não há valor a pagar.']
      : d.pago
        ? [`*Total: ${reais(d.total)}* (já pago).`]
        : [
            `*Total a pagar: ${reais(d.total)}*`,
            d.pix.chave ? `Pix para a Viva Noz, chave ${d.pix.chave}${d.pix.favorecido ? ` (${d.pix.favorecido})` : ''}.` : 'Pagamento por Pix, direto para a Viva Noz.',
            'Depois do Pix, me envie o comprovante por aqui.',
          ]),
    ...(link ? ['', `Documento completo: ${link}`] : []),
    '',
    'Obrigado. viva a pausa.',
  ].join('\n')
}
