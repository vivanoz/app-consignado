import { useState } from 'react'
import { Campo, Selecao } from './ui'

// Segmentos já mapeados pela Viva Noz. O que não estiver aqui entra por
// "Outros", com o nome digitado.
export const SEGMENTOS = [
  'Arena de jogos de praia',
  'Clube',
  'Academia ou estúdio',
  'Cafeteria',
  'Empório',
  'Loja de produtos naturais',
  'Salão ou barbearia',
  'Coworking',
  'Clínica ou consultório',
]

const OUTROS = '__outros__'

export function CampoSegmento({ valor, aoMudar }: { valor: string; aoMudar: (segmento: string) => void }) {
  // Valor fora da lista (cadastro antigo ou digitado) abre direto em "Outros".
  const [outros, setOutros] = useState(valor !== '' && !SEGMENTOS.includes(valor))
  const foraDaLista = outros || (valor !== '' && !SEGMENTOS.includes(valor))

  return (
    <div className="space-y-3">
      <Selecao
        rotulo="Segmento"
        value={foraDaLista ? OUTROS : valor}
        onChange={(e) => {
          const escolhido = e.target.value
          setOutros(escolhido === OUTROS)
          aoMudar(escolhido === OUTROS ? '' : escolhido)
        }}
      >
        <option value="">Escolha</option>
        {SEGMENTOS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={OUTROS}>Outros</option>
      </Selecao>
      {foraDaLista && <Campo rotulo="Qual segmento" required autoFocus placeholder="Escreva o segmento" value={valor} onChange={(e) => aoMudar(e.target.value)} />}
    </div>
  )
}
