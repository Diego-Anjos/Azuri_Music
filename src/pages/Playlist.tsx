import { Clock3, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getPlaylistDetails,
  type SpotifyPlaylistDetails,
} from '../services/spotify'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function Playlist() {
  const { id } = useParams<{ id: string }>()
  const playTrack = usePlayerStore((state) => state.playTrack)

  const [playlist, setPlaylist] = useState<SpotifyPlaylistDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    let cancelled = false

    async function loadPlaylist() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await getPlaylistDetails(id!)
        if (!cancelled) setPlaylist(data)
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Erro ao carregar playlist',
          )
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadPlaylist()

    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#1E293B] to-[#0B0F19]">
      {isLoading && (
        <p className="px-4 pt-8 text-sm text-[#94A3B8] md:px-8">
          Carregando playlist...
        </p>
      )}

      {!isLoading && error && (
        <p className="px-4 pt-8 text-sm text-red-400 md:px-8">{error}</p>
      )}

      {!isLoading && !error && playlist && (
        <>
          <header className="flex flex-col gap-6 px-4 pb-6 pt-8 sm:flex-row sm:items-end md:px-8">
            {playlist.imageUrl ? (
              <img
                src={playlist.imageUrl}
                alt={playlist.name}
                className="size-48 shrink-0 rounded-md object-cover shadow-2xl shadow-black/50 sm:size-56"
              />
            ) : (
              <div className="size-48 shrink-0 rounded-md bg-[#111827] sm:size-56" />
            )}

            <div className="min-w-0 flex-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#F8FAFC]">
                Playlist
              </p>
              <h1 className="mb-3 text-4xl font-bold tracking-tight text-[#F8FAFC] sm:text-5xl md:text-6xl">
                {playlist.name}
              </h1>
              {playlist.description && (
                <p className="mb-3 line-clamp-2 text-sm text-[#94A3B8]">
                  {playlist.description.replace(/<[^>]+>/g, '')}
                </p>
              )}
              <p className="text-sm text-[#F8FAFC]">
                <span className="font-semibold">{playlist.ownerName}</span>
                <span className="text-[#94A3B8]">
                  {' '}
                  · {playlist.tracks.length} faixas
                </span>
              </p>
            </div>
          </header>

          <section className="px-2 pb-8 md:px-6">
            <div className="grid grid-cols-[32px_minmax(0,1fr)_72px] gap-3 border-b border-white/10 px-3 pb-2 text-xs font-medium uppercase tracking-wider text-[#94A3B8] sm:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_72px]">
              <span className="text-center">#</span>
              <span>Título</span>
              <span className="hidden sm:block">Artista</span>
              <span className="flex justify-end">
                <Clock3 className="size-4" strokeWidth={ICON_STROKE} />
              </span>
            </div>

            <ul>
              {playlist.tracks.map((track, index) => (
                <li
                  key={`${track.id}-${index}`}
                  className="group grid grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-white/5 sm:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_72px]"
                >
                  <div className="relative flex h-8 items-center justify-center">
                    <span className="text-sm text-[#94A3B8] group-hover:hidden">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`Reproduzir ${track.title}`}
                      onClick={() =>
                        playTrack({
                          id: track.id,
                          title: track.title,
                          artist: track.artist,
                          coverUrl: track.albumCoverUrl || playlist.imageUrl,
                          duration: Math.floor(track.durationMs / 1000),
                        })
                      }
                      className="absolute inset-0 hidden items-center justify-center text-[#F8FAFC] group-hover:flex"
                    >
                      <Play
                        className="size-4 translate-x-px"
                        strokeWidth={ICON_STROKE}
                        fill="currentColor"
                      />
                    </button>
                  </div>

                  <div className="flex min-w-0 items-center gap-3">
                    {track.albumCoverUrl ? (
                      <img
                        src={track.albumCoverUrl}
                        alt={track.title}
                        className="size-10 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="size-10 shrink-0 rounded bg-[#111827]" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#F8FAFC]">
                        {track.title}
                      </p>
                      <p className="truncate text-xs text-[#94A3B8] sm:hidden">
                        {track.artist}
                      </p>
                    </div>
                  </div>

                  <p className="hidden truncate text-sm text-[#94A3B8] sm:block">
                    {track.artist}
                  </p>

                  <p className="text-right text-sm text-[#94A3B8]">
                    {formatDuration(track.durationMs)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  )
}
