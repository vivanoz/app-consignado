import { NavLink, Outlet } from 'react-router-dom'
import { useAcesso } from '../lib/auth'
import type { Papel } from '../lib/tipos'

// O menu muda com o perfil. O banco é quem de fato barra o acesso; aqui só
// deixamos de mostrar o que a pessoa não usa.
const MENU: { para: string; nome: string; papeis: Papel[] }[] = [
  { para: '/', nome: 'Início', papeis: ['gestao', 'producao', 'representante'] },
  { para: '/lojas', nome: 'Lojas', papeis: ['gestao', 'representante'] },
  { para: '/estoque', nome: 'Estoque', papeis: ['gestao', 'producao', 'representante'] },
  { para: '/acertos', nome: 'Acertos', papeis: ['gestao', 'representante'] },
  { para: '/mais', nome: 'Mais', papeis: ['gestao', 'producao', 'representante'] },
]

export function Layout() {
  const { papel } = useAcesso()
  const itens = MENU.filter((m) => papel && m.papeis.includes(papel))

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="flex items-center gap-3 bg-profundo px-4 py-2.5 text-creme">
        <img src="./marca/selo-uma-cor-creme.png" alt="Viva Noz" className="size-10" />
        <p className="font-serif text-xl leading-none italic">viva a pausa.</p>
      </header>

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
                  `block border-t-2 py-3.5 text-center text-[13px] font-semibold ${
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
