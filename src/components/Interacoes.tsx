import { useState, type FormEvent } from 'react'
import { useInteracoes, useRegistrarInteracao } from '../lib/api'
import { NOME_INTERACAO } from '../lib/crm'
import { dataHora } from '../lib/formato'
import type { InteracaoTipo } from '../lib/tipos'
import { AreaDeTexto, Aviso, Botao, Cartao, Rotulo, Vazio } from './ui'

const TIPOS: InteracaoTipo[] = ['visita', 'whatsapp', 'ligacao', 'email', 'nota']

// Histórico de contatos com um lead ou com um cliente: o que foi conversado,
// por onde e quando. Não se edita; o que mudou entra como novo registro.
export function Interacoes({ de, representanteId }: { de: { lojaId?: string; prospectoId?: string }; representanteId: string }) {
  const interacoes = useInteracoes(de)
  const registrar = useRegistrarInteracao()
  const [tipo, setTipo] = useState<InteracaoTipo>('visita')
  const [descricao, setDescricao] = useState('')
  const [abrindo, setAbrindo] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await registrar.mutateAsync({ tipo, descricao: descricao.trim(), representante_id: representanteId, loja_id: de.lojaId ?? null, prospecto_id: de.prospectoId ?? null })
    setDescricao('')
    setAbrindo(false)
  }

  return (
    <div className="space-y-3">
      {abrindo ? (
        <Cartao>
          <Rotulo>Registrar interação</Rotulo>
          <form onSubmit={enviar} className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => (
                <button key={t} type="button" onClick={() => setTipo(t)} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${tipo === t ? 'border-verde bg-verde text-creme' : 'border-marrom/30'}`}>
                  {NOME_INTERACAO[t]}
                </button>
              ))}
            </div>
            <AreaDeTexto rotulo="O que aconteceu" valor={descricao} aoMudar={setDescricao} dica="Com quem falou, o que foi dito, o que ficou combinado." />
            <Aviso erro={registrar.error} />
            <Botao type="submit" cheio disabled={registrar.isPending || !descricao.trim()}>
              Salvar
            </Botao>
            <Botao variante="discreto" cheio onClick={() => setAbrindo(false)}>
              Cancelar
            </Botao>
          </form>
        </Cartao>
      ) : (
        <Botao variante="secundario" cheio onClick={() => setAbrindo(true)}>
          Registrar interação
        </Botao>
      )}

      {interacoes.data?.length === 0 && <Vazio>Nenhuma interação registrada.</Vazio>}
      {interacoes.data && interacoes.data.length > 0 && (
        <Cartao className="divide-y divide-linha py-1">
          {interacoes.data.map((i) => (
            <div key={i.id} className="py-2.5">
              <p className="text-xs font-semibold text-verde">
                {NOME_INTERACAO[i.tipo]} · {dataHora(i.ocorrido_em)}
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-line">{i.descricao}</p>
            </div>
          ))}
        </Cartao>
      )}
    </div>
  )
}
