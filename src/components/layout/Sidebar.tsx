import {
  Disc3,
  Home,
  Library,
  ListMusic,
  Mic2,
  Plus,
  Search,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { id: 'home', label: 'Home', icon: Home, to: '/' },
  { id: 'search', label: 'Search', icon: Search, to: '/search' },
  { id: 'library', label: 'Library', icon: Library, to: '/' },
] as const

const libraryItems = [
  {
    id: '1',
    label: 'Mix Neon',
    type: 'Playlist',
    icon: ListMusic,
    imageUrl: 'https://picsum.photos/seed/lib-1/80/80',
  },
  {
    id: '2',
    label: 'Azuri Collective',
    type: 'Artista',
    icon: Mic2,
    imageUrl: 'https://picsum.photos/seed/lib-2/80/80',
  },
  {
    id: '3',
    label: 'Midnight Drive',
    type: 'Álbum',
    icon: Disc3,
    imageUrl: 'https://picsum.photos/seed/lib-3/80/80',
  },
  {
    id: '4',
    label: 'Focus Flow',
    type: 'Playlist',
    icon: ListMusic,
    imageUrl: 'https://picsum.photos/seed/lib-4/80/80',
  },
  {
    id: '5',
    label: 'Luna Vox',
    type: 'Artista',
    icon: Mic2,
    imageUrl: 'https://picsum.photos/seed/lib-5/80/80',
  },
  {
    id: '6',
    label: 'Deep Blue EP',
    type: 'Álbum',
    icon: Disc3,
    imageUrl: 'https://picsum.photos/seed/lib-6/80/80',
  },
  {
    id: '7',
    label: 'Chill Azuri',
    type: 'Playlist',
    icon: ListMusic,
    imageUrl: 'https://picsum.photos/seed/lib-7/80/80',
  },
  {
    id: '8',
    label: 'Pulse Unit',
    type: 'Artista',
    icon: Mic2,
    imageUrl: 'https://picsum.photos/seed/lib-8/80/80',
  },
] as const

const ICON_STROKE = 1.5

export function Sidebar() {
  const location = useLocation()

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col bg-[#0B0F19] md:flex">
      <div className="px-4 pt-6">
        <Link
          to="/"
          className="mb-6 block px-2 text-2xl font-bold tracking-tight text-[#00E5FF]"
        >
          Azuri Music
        </Link>

        <nav className="flex flex-col gap-1">
          {navItems.map(({ id, label, icon: Icon, to }) => {
            const isActive =
              id === 'home'
                ? location.pathname === '/'
                : location.pathname.startsWith(to) && to !== '/'

            return (
              <Link
                key={id}
                to={to}
                className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  isActive
                    ? 'bg-[#00E5FF] text-black'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                <Icon className="size-5 shrink-0" strokeWidth={ICON_STROKE} />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        <button
          type="button"
          className="mt-4 flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[#94A3B8] transition-colors duration-200 hover:text-[#F8FAFC]"
        >
          <Plus className="size-5 shrink-0" strokeWidth={ICON_STROKE} />
          <span>Criar playlist</span>
        </button>
      </div>

      <div className="mx-4 mt-4 border-t border-white/10" />

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
            Sua Biblioteca
          </h2>
          <button
            type="button"
            aria-label="Adicionar à biblioteca"
            className="rounded-full p-1 text-[#94A3B8] transition-colors hover:text-[#F8FAFC]"
          >
            <Plus className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {libraryItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/5"
            >
              <img
                src={item.imageUrl}
                alt={item.label}
                className="size-10 shrink-0 rounded-full object-cover ring-1 ring-white/10"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#F8FAFC]">
                  {item.label}
                </p>
                <p className="truncate text-xs text-[#94A3B8]">{item.type}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
