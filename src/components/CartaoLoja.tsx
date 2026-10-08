import { Link } from 'react-router-dom'
import { NOME_MODALIDADE, REPOR_ATE, haQuanto } from '../lib/formato'
import type { ResumoLoja } from '../lib/resumo'
import { Foto } from './arquivos'
import { Etiqueta } from './ui'

// Uma loja na lista: foto, quanto tem de cada sabor e se precisa de reposição.
export function CartaoLoja({ resumo, representante }: { resumo: ResumoLoja; representante?: string }) {
  const { loja, saldos, ultimaVisita, precisaRepor } = resumo
  const direta = loja.modalidade === 'compra_direta'

  return (
    <Link to={`/lojas/${loja.id}`} className="flex gap-3 rounded-2xl border border-linha bg-papel p-3 active:bg-areia/25">
      <Foto caminho={loja.foto_path} nome={loja.nome} formato="quadrada" className="size-[72px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[16px] leading-snug font-bold">{loja.nome}</p>
          {loja.status !== 'ativa' ? (
            <Etiqueta tom="alerta">{loja.status === 'pausada' ? 'Pausada' : 'Encerrada'}</Etiqueta>
          ) : precisaRepor ? (
            <Etiqueta tom="alerta">Repor</Etiqueta>
          ) : (
            <Etiqueta tom="verde">{direta ? 'Direta' : 'Em dia'}</Etiqueta>
          )}
        </div>
        <p className="truncate text-xs text-marrom/65">
          {[loja.bairro, NOME_MODALIDADE[loja.modalidade], representante].filter(Boolean).join(' · ')}
        </p>
        {!direta && (
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-[13px]">
            {saldos.map((s) => (
              <span key={s.nome} className={s.quantidade <= REPOR_ATE ? 'font-bold text-alerta' : 'font-semibold'}>
                {s.nome} {s.quantidade}
              </span>
            ))}
          </p>
        )}
        <p className="mt-0.5 text-xs text-marrom/60">{haQuanto(ultimaVisita)}</p>
      </div>
    </Link>
  )
}
