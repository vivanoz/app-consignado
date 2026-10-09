import { NavLink, Outlet } from 'react-router-dom'
import { useRepresentantes } from '../lib/api'
import { useAcesso } from '../lib/auth'
import { NOME_PAPEL } from '../lib/formato'
import type { Papel } from '../lib/tipos'
import { Foto } from './arquivos'

// O menu muda com o perfil. O banco é quem de fato barra o acesso; aqui só
// deixamos de mostrar o que a pessoa não usa.
const MENU: { para: string; nome: string; papeis: Papel[] }[] = [
  { para: '/', nome: 'Início', papeis: ['gestao', 'producao', 'representante'] },
  { para: '/lojas', nome: 'Clientes', papeis: ['gestao', 'representante'] },
  { para: '/crm', nome: 'CRM', papeis: ['gestao', 'representante'] },
  { para: '/estoque', nome: 'Estoque', papeis: ['gestao', 'producao', 'representante'] },
  { para: '/financeiro', nome: 'Finanças', papeis: ['gestao', 'representante'] },
  { para: '/mais', nome: 'Mais', papeis: ['gestao', 'producao', 'representante'] },
]

export function Layout() {
  const { papel, perfil, meuRepresentanteId, visaoDe, verComo } = useAcesso()
  const representantes = useRepresentantes()
  const itens = MENU.filter((m) => papel && m.papeis.includes(papel))
  const eu = representantes.data?.find((r) => r.id === meuRepresentanteId)

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center gap-3 bg-profundo px-4 py-2.5 text-creme">
        <img src="./marca/selo-uma-cor-creme.png" alt="Viva Noz" className="size-10" />
        <p className="flex-1 font-serif text-xl leading-none italic">viva a pausa.</p>
        <NavLink to="/mais" className="flex items-center gap-2 text-right">
          <span className="text-[11px] leading-tight font-semibold tracking-wide text-creme/75 uppercase">
            {papel && NOME_PAPEL[papel]}
            {papel === 'gestao' && meuRepresentanteId && <span className="block">e visitas</span>}
          </span>
          <Foto caminho={eu?.foto_path} nome={perfil?.nome ?? ''} className="size-9 text-sm" />
        </NavLink>
      </header>

      {visaoDe && (
        <div className="flex items-center justify-between gap-3 bg-ouro px-4 py-2 text-sm text-profundo">
          <p>
            Você está vendo como <strong>{visaoDe.nome}</strong>. O que gravar aqui vale de verdade.
          </p>
          <button type="button" onClick={() => verComo(null)} className="min-h-9 shrink-0 rounded-lg bg-profundo px-3 font-semibold text-creme">
            Voltar à gestão
          </button>
        </div>
      )}

      <main className="flex-1 px-4 pt-5 pb-28">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-linha bg-papel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex max-w-xl">
          {itens.map((item) => (
            <li key={item.para} className="flex-1">
              <NavLink
                to={item.para}
                end={item.para === '/'}
                className={({ isActive }) =>
                  `block border-t-2 py-3.5 text-center text-[12px] font-semibold ${
                    isActive ? 'border-verde text-verde' : 'border-transparent text-marrom/60'
                  }`
                }
              >
                {item.nome}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
