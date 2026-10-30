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

function PlaylistSkeleton() {
  return (
    <div className="animate-pulse">
      <header className="flex flex-col gap-6 px-4 pb-6 pt-8 sm:flex-row sm:items-end md:px-8">
        <div className="size-48 shrink-0 rounded-md bg-[#111827] sm:size-56" />
        <div className="min-w-0 flex-1 space-y-3 pb-1">
          <div className="h-3 w-16 rounded bg-white/10" />
          <div className="h-10 w-2/3 max-w-md rounded bg-white/10" />
          <div className="h-4 w-1/2 max-w-sm rounded bg-white/5" />
          <div className="h-4 w-32 rounded bg-white/5" />
        </div>
      </header>

      <section className="px-2 pb-8 md:px-6">
        <div className="mb-2 grid grid-cols-[32px_minmax(0,1fr)_72px] gap-3 border-b border-white/10 px-3 pb-2 sm:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_72px]">
          <div className="mx-auto h-3 w-4 rounded bg-white/5" />
          <div className="h-3 w-12 rounded bg-white/5" />
          <div className="hidden h-3 w-14 rounded bg-white/5 sm:block" />
          <div className="ml-auto h-3 w-4 rounded bg-white/5" />
        </div>

        <ul className="space-y-1">
          {Array.from({ length: 8 }).map((_, index) => (
            <li
              key={index}
              className="grid grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3 px-3 py-2 sm:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_72px]"
            >
              <div className="mx-auto h-3 w-4 rounded bg-white/5" />
              <div className="flex min-w-0 items-center gap-3">
                <div className="size-10 shrink-0 rounded bg-[#111827]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-white/10" />
                  <div className="h-3 w-1/2 rounded bg-white/5 sm:hidden" />
                </div>
              </div>
              <div className="hidden h-3 w-2/3 rounded bg-white/5 sm:block" />
              <div className="ml-auto h-3 w-8 rounded bg-white/5" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
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

    void loadPlaylist()

    return () => {
      cancelled = true
    }
  }, [id])

  const trackItems = playlist?.tracks?.items ?? []
  const trackCount =
    playlist?.tracks?.total ?? playlist?.tracks?.items?.length ?? 0

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#1E293B] to-[#0B0F19]">
      {isLoading && <PlaylistSkeleton />}

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
                <span className="text-[#94A3B8]"> · {trackCount} faixas</span>
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
              {playlist.tracks.items.map((item, index) => {
                const track = item.track
                if (!track) return null

                const coverUrl =
                  track.album?.images?.[0]?.url || playlist.imageUrl
                const artistName =
                  track.artists?.[0]?.name ?? 'Artista desconhecido'

                return (
                  <li
                    key={`${track.id}-${index}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      void playTrack(track)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void playTrack(track)
                      }
                    }}
                    className="group grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-white/5 sm:grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_72px]"
                  >
                    <div className="relative flex h-8 items-center justify-center">
                      <span className="text-sm text-[#94A3B8] group-hover:hidden">
                        {index + 1}
                      </span>
                      <span className="absolute inset-0 hidden items-center justify-center text-[#F8FAFC] group-hover:flex">
                        <Play
                          className="size-4 translate-x-px"
                          strokeWidth={ICON_STROKE}
                          fill="currentColor"
                        />
                      </span>
                    </div>

                    <div className="flex min-w-0 items-center gap-3">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={track.name}
                          className="size-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="size-10 shrink-0 rounded bg-[#111827]" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#F8FAFC]">
                          {track.name}
                        </p>
                        <p className="truncate text-xs text-[#94A3B8] sm:hidden">
                          {artistName}
                        </p>
                      </div>
                    </div>

                    <p className="hidden truncate text-sm text-[#94A3B8] sm:block">
                      {artistName}
                    </p>

                    <p className="text-right text-sm text-[#94A3B8]">
                      {formatDuration(track.duration_ms)}
                    </p>
                  </li>
                )
              })}
            </ul>

            {trackItems.length === 0 && (
              <p className="px-3 pt-6 text-sm text-[#94A3B8]">
                Esta playlist não tem faixas acessíveis via API no momento.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  )
}
