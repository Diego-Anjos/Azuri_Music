import {
  Home,
  Library,
  ListMusic,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  createPlaylist,
  getPlaylists,
  subscribeLibraryUpdates,
  type UserPlaylist,
} from '../../services/libraryStorage'

const navItems = [
  { id: 'home', label: 'Home', icon: Home, to: '/' },
  { id: 'search', label: 'Search', icon: Search, to: '/search' },
  { id: 'library', label: 'Library', icon: Library, to: '/' },
] as const

const ICON_STROKE = 1.5

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() => getPlaylists())
  const [isCreating, setIsCreating] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')

  useEffect(() => {
    setPlaylists(getPlaylists())
    return subscribeLibraryUpdates(() => {
      setPlaylists(getPlaylists())
    })
  }, [])

  function handleCreatePlaylist(event: FormEvent) {
    event.preventDefault()
    const trimmed = newPlaylistName.trim()
    if (!trimmed) return

    const playlist = createPlaylist(trimmed)
    setNewPlaylistName('')
    setIsCreating(false)
    setPlaylists(getPlaylists())
    navigate(`/playlist/${playlist.id}`)
  }

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col bg-[#0B0F19] md:flex">
      <div className="px-4 pt-6">
        <Link to="/" className="block">
          <div className="mb-4 flex items-center gap-2.5 px-4 py-4">
            <img
              src="/logo.png"
              alt="Azuri Logo"
              className="h-14 w-14 shrink-0 scale-125 object-contain drop-shadow-[0_0_10px_rgba(0,229,255,0.6)]"
            />
            <h1 className="whitespace-nowrap bg-gradient-to-r from-white to-cyan-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              Azuri Music
            </h1>
          </div>
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

        {!isCreating ? (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="mt-4 flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[#94A3B8] transition-colors duration-200 hover:text-[#F8FAFC]"
          >
            <Plus className="size-5 shrink-0" strokeWidth={ICON_STROKE} />
            <span>Criar playlist</span>
          </button>
        ) : (
          <form
            onSubmit={handleCreatePlaylist}
            className="mt-4 rounded-xl border border-white/10 bg-white/5 p-2"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-medium text-gray-400">
                Nova playlist
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false)
                  setNewPlaylistName('')
                }}
                className="rounded-full p-1 text-gray-400 hover:text-white"
                aria-label="Cancelar"
              >
                <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              </button>
            </div>
            <input
              autoFocus
              type="text"
              value={newPlaylistName}
              onChange={(event) => setNewPlaylistName(event.target.value)}
              placeholder="Nome da playlist"
              className="mb-2 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-cyan-400/50"
            />
            <button
              type="submit"
              disabled={!newPlaylistName.trim()}
              className="w-full rounded-lg bg-cyan-400 py-1.5 text-xs font-bold text-black transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Criar
            </button>
          </form>
        )}
      </div>

      <div className="mx-4 mt-4 border-t border-white/10" />

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
            Sua Biblioteca
          </h2>
          <button
            type="button"
            aria-label="Criar playlist"
            onClick={() => setIsCreating(true)}
            className="rounded-full p-1 text-[#94A3B8] transition-colors hover:text-[#F8FAFC]"
          >
            <Plus className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {playlists.map((playlist) => {
            const isActive = location.pathname === `/playlist/${playlist.id}`

            return (
              <Link
                key={playlist.id}
                to={`/playlist/${playlist.id}`}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/5 ${
                  isActive ? 'bg-white/5' : ''
                }`}
              >
                {playlist.coverUrl ? (
                  <img
                    src={playlist.coverUrl}
                    alt={playlist.name}
                    className="size-10 shrink-0 rounded-md object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/5 text-cyan-400 ring-1 ring-white/10">
                    <ListMusic className="size-4" strokeWidth={ICON_STROKE} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#F8FAFC]">
                    {playlist.name}
                  </p>
                  <p className="truncate text-xs text-[#94A3B8]">
                    Playlist • {playlist.tracks.length}{' '}
                    {playlist.tracks.length === 1 ? 'faixa' : 'faixas'}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
