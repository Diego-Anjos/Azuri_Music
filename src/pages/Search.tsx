import { Play, Search as SearchIcon, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PlaylistCard } from '../components/PlaylistCard'
import {
  searchCatalog,
  type SpotifyArtist,
  type SpotifyCatalogSearchResult,
  type SpotifyPlaylist,
  type SpotifyTrack,
} from '../services/spotify'
import {
  usePlayerStore,
  type PlayerTrack,
} from '../store/usePlayerStore'

const ICON_STROKE = 1.5
const DEBOUNCE_MS = 400

const emptyResults: SpotifyCatalogSearchResult = {
  tracks: [],
  artists: [],
  playlists: [],
}

export function Search() {
  const playTrack = usePlayerStore((state) => state.playTrack)
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q')?.trim() ?? ''
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [results, setResults] =
    useState<SpotifyCatalogSearchResult>(emptyResults)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = searchParams.get('q')?.trim() ?? ''
    setQuery(fromUrl)
    setDebouncedQuery(fromUrl)
  }, [searchParams])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!debouncedQuery) {
      setResults(emptyResults)
      setError(null)
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function runSearch() {
      try {
        setIsLoading(true)
        setError(null)
        const data = await searchCatalog(debouncedQuery)
        if (!cancelled) setResults(data)
      } catch (err) {
        if (!cancelled) {
          setResults(emptyResults)
          setError(err instanceof Error ? err.message : 'Erro na pesquisa')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void runSearch()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const hasResults =
    results.tracks.length > 0 ||
    results.artists.length > 0 ||
    results.playlists.length > 0

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#1E293B] to-[#0B0F19]">
      <header className="px-4 pb-2 pt-2 md:px-8 md:pt-4">
        <h2 className="mb-4 text-3xl font-bold text-[#F8FAFC]">Pesquisar</h2>
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar músicas, artistas e playlists</span>
          <SearchIcon
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#94A3B8]"
            strokeWidth={ICON_STROKE}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setDebouncedQuery(query.trim())
              }
            }}
            placeholder="O que você quer ouvir?"
            className="w-full rounded-full border border-white/10 bg-[#111827] py-3 pl-12 pr-4 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8] outline-none transition-colors focus:border-[#00E5FF]/60 focus:ring-2 focus:ring-[#00E5FF]/30"
          />
        </label>
      </header>

      <div className="space-y-8 px-4 py-6 md:px-8">
        {!debouncedQuery && (
          <p className="text-sm text-[#94A3B8]">
            Digite um artista, música ou playlist para começar.
          </p>
        )}

        {debouncedQuery && isLoading && (
          <p className="text-sm text-[#94A3B8]">A pesquisar...</p>
        )}

        {debouncedQuery && !isLoading && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {debouncedQuery && !isLoading && !error && !hasResults && (
          <p className="text-sm text-[#94A3B8]">
            Nenhum resultado para &ldquo;{debouncedQuery}&rdquo;.
          </p>
        )}

        {debouncedQuery && !isLoading && !error && hasResults && (
          <>
            <ArtistsSection artists={results.artists} />
            <TracksSection
              tracks={results.tracks}
              onPlay={(track) =>
                playTrack(
                  track,
                  results.tracks.map((item) => toPlayerTrack(item)),
                )
              }
            />
            <PlaylistsSection playlists={results.playlists} />
          </>
        )}
      </div>
    </main>
  )
}

const ARTIST_LINK_CLASS =
  'cursor-pointer text-sm text-gray-400 transition-colors hover:text-cyan-400 hover:underline'

function toPlayerTrack(track: SpotifyTrack): PlayerTrack {
  return {
    id: track.id,
    name: track.name,
    artists:
      track.artists.length > 0
        ? track.artists.map((artist) => ({
            id: artist.id,
            name: artist.name,
          }))
        : [{ name: track.artistName }],
    album: {
      name: track.albumName,
      release_date: track.albumReleaseDate,
      images: track.albumCoverUrl ? [{ url: track.albumCoverUrl }] : [],
    },
    duration_ms: track.durationMs,
  }
}

function TracksSection({
  tracks,
  onPlay,
}: {
  tracks: SpotifyTrack[]
  onPlay: (track: PlayerTrack) => Promise<void>
}) {
  if (tracks.length === 0) return null

  return (
    <section>
      <h3 className="mb-3 text-xl font-bold text-[#F8FAFC]">Músicas</h3>
      <ul className="space-y-1">
        {tracks.map((track, index) => (
          <li key={track.id}>
            <div className="group flex w-full items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-white/5">
              <button
                type="button"
                onClick={() => void onPlay(toPlayerTrack(track))}
                className="flex shrink-0 items-center gap-3 text-left"
                aria-label={`Reproduzir ${track.name}`}
              >
                <span className="w-6 text-center text-sm text-[#94A3B8] group-hover:hidden">
                  {index + 1}
                </span>
                <span className="hidden w-6 items-center justify-center text-[#F8FAFC] group-hover:flex">
                  <Play
                    className="size-4 translate-x-px"
                    strokeWidth={ICON_STROKE}
                    fill="currentColor"
                  />
                </span>

                {track.albumCoverUrl ? (
                  <img
                    src={track.albumCoverUrl}
                    alt={track.name}
                    className="size-10 rounded object-cover"
                  />
                ) : (
                  <div className="size-10 rounded bg-[#111827]" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => void onPlay(toPlayerTrack(track))}
                  className="block w-full truncate text-left text-sm font-medium text-[#F8FAFC]"
                >
                  {track.name}
                </button>
                <p className="truncate">
                  {(track.artists.length > 0
                    ? track.artists
                    : [{ id: '', name: track.artistName }]
                  ).map((artist, artistIndex) => (
                    <span key={`${artist.id}-${artist.name}-${artistIndex}`}>
                      {artistIndex > 0 && (
                        <span className="text-sm text-gray-400">, </span>
                      )}
                      {artist.id ? (
                        <Link
                          to={`/artist/${artist.id}`}
                          state={{ artistName: artist.name }}
                          className={ARTIST_LINK_CLASS}
                        >
                          {artist.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-gray-400">
                          {artist.name}
                        </span>
                      )}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ArtistsSection({ artists }: { artists: SpotifyArtist[] }) {
  const navigate = useNavigate()

  if (artists.length === 0) return null

  return (
    <section>
      <h3 className="mb-4 text-xl font-bold text-[#F8FAFC]">Artistas</h3>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5">
        {artists.map((artist) => (
          <button
            key={artist.id}
            type="button"
            onClick={() =>
              navigate(`/artist/${artist.id}`, {
                state: { artistName: artist.name },
              })
            }
            className="group flex cursor-pointer flex-col items-center rounded-2xl border border-white/5 bg-[#111827]/70 p-4 text-center transition-all hover:border-cyan-400/40 hover:bg-[#1E293B]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
          >
            {artist.imageUrl ? (
              <img
                src={artist.imageUrl}
                alt={artist.name}
                className="mb-3 h-28 w-28 rounded-full object-cover shadow-xl transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="mb-3 flex h-28 w-28 items-center justify-center rounded-full bg-[#0B0F19] shadow-xl transition-transform group-hover:scale-105">
                <User
                  className="size-10 text-[#94A3B8]"
                  strokeWidth={ICON_STROKE}
                />
              </div>
            )}
            <h4 className="w-full truncate font-bold text-white group-hover:text-cyan-400">
              {artist.name}
            </h4>
            <span className="mt-1 inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-400">
              Artista
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function PlaylistsSection({ playlists }: { playlists: SpotifyPlaylist[] }) {
  if (playlists.length === 0) return null

  return (
    <section>
      <h3 className="mb-3 text-xl font-bold text-[#F8FAFC]">Playlists</h3>
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {playlists.map((playlist) => (
          <Link
            key={playlist.id}
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
