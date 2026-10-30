import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'
import { PlaylistCard } from '../PlaylistCard'
import type { SpotifyPlaylist } from '../../services/spotify'

const ICON_STROKE = 1.5

interface MainContentProps {
  recentPlaylists: SpotifyPlaylist[]
  mixPlaylists: SpotifyPlaylist[]
  electronicPlaylists: SpotifyPlaylist[]
  isLoading: boolean
  error: string | null
}

export function MainContent({
  recentPlaylists,
  mixPlaylists,
  electronicPlaylists,
  isLoading,
  error,
}: MainContentProps) {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#1E293B] to-[#0B0F19]">
      <header className="px-4 pb-2 pt-6 md:px-8">
        <h2 className="text-3xl font-bold text-[#F8FAFC]">Boa tarde</h2>
      </header>

      <div className="space-y-8 px-4 py-4 md:px-8">
        {isLoading && (
          <p className="text-sm text-[#94A3B8]">Carregando playlists...</p>
        )}

        {!isLoading && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!isLoading && !error && (
          <>
            <section>
              <h3 className="mb-3 text-lg font-semibold text-[#F8FAFC]">
                Atalhos recentes
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {recentPlaylists.map((playlist) => (
                  <Link
                    key={`shortcut-${playlist.id}`}
                    to={`/playlist/${playlist.id}`}
                    className="group flex h-16 items-center gap-3 overflow-hidden rounded-md bg-white/10 transition-colors hover:bg-white/15"
                  >
                    {playlist.imageUrl ? (
                      <img
                        src={playlist.imageUrl}
                        alt={playlist.name}
                        className="h-full w-16 shrink-0 object-cover"
                      />
                    ) : (
                      <div className="h-full w-16 shrink-0 bg-[#111827]" />
                    )}
                    <span className="min-w-0 flex-1 truncate pr-2 text-sm font-semibold text-[#F8FAFC]">
                      {playlist.name}
                    </span>
                    <span className="mr-3 flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00E5FF] text-black opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      <Play
                        className="size-4 translate-x-px"
                        strokeWidth={ICON_STROKE}
                        fill="currentColor"
                      />
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <PlaylistCarousel title="Mixado para ti" playlists={mixPlaylists} />

            <PlaylistCarousel
              title="Suas músicas estão com saudade"
              playlists={electronicPlaylists}
            />
          </>
        )}
      </div>
    </main>
  )
}

function PlaylistCarousel({
  title,
  playlists,
}: {
  title: string
  playlists: SpotifyPlaylist[]
}) {
  if (playlists.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4">
        <h3 className="text-xl font-bold text-[#F8FAFC]">{title}</h3>
        <button
          type="button"
          className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] transition-colors hover:text-[#F8FAFC]"
        >
          Mostrar tudo
        </button>
      </div>

      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {playlists.map((playlist) => (
          <Link
            key={`${title}-${playlist.id}`}
            to={`/playlist/${playlist.id}`}
            className="w-40 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] sm:w-44"
          >
            <PlaylistCard
              name={playlist.name}
              description={playlist.description}
              imageUrl={playlist.imageUrl}
            />
          </Link>
        ))}
      </div>
    </section>
  )
}
