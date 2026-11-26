import { Home, Library, Search, UserRound } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { TopNavControls } from '../TopNavControls'
import { usePlayerStore } from '../../store/usePlayerStore'
import { MusicPlayer } from './MusicPlayer'
import { Sidebar } from './Sidebar'

const ICON_STROKE = 1.5

const mobileNavItems = [
  { id: 'home', label: 'Home', icon: Home, to: '/home' },
  { id: 'search', label: 'Search', icon: Search, to: '/search' },
  { id: 'library', label: 'Library', icon: Library, to: '/library' },
  { id: 'profile', label: 'Perfil', icon: UserRound, to: '/profile' },
] as const

function MobileBottomNav() {
  const location = useLocation()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex h-14 items-center justify-around border-t border-white/10 bg-[#0B0F19]/95 px-2 backdrop-blur-xl md:hidden"
      aria-label="Navegação principal"
    >
      {mobileNavItems.map(({ id, label, icon: Icon, to }) => {
        const isActive =
          id === 'home'
            ? location.pathname === '/home'
            : location.pathname.startsWith(to)

        return (
          <Link
            key={id}
            to={to}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 transition-colors ${
              isActive ? 'text-cyan-400' : 'text-[#94A3B8]'
            }`}
          >
            <Icon className="size-5" strokeWidth={ICON_STROKE} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function AppLayout() {
  const isLyricsOpen = usePlayerStore((s) => s.isLyricsOpen)

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#0B0F19]">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto pb-36 md:pb-28">
          {!isLyricsOpen && <TopNavControls />}
          <Outlet />
        </main>
      </div>
      <MusicPlayer />
      <MobileBottomNav />
    </div>
  )
}
