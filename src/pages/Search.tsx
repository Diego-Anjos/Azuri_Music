import { Play, Search as SearchIcon, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PlaylistCard } from '../components/PlaylistCard'
import { getUserReleases } from '../services/creatorService'
import {
  getLikedTracks,
  getPlaylists,
  getRecentPlays,
  type FollowingArtist,
  getFollowingArtists,
} from '../services/libraryStorage'
import { getListeningHistory } from '../services/recommendationService'
import {
  isSpotifyCoolingDown,
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
const DEBOUNCE_MS = 450
const BACKEND_SEARCH_URL = 'http://localhost:3001/api/search'

const emptyResults: SpotifyCatalogSearchResult = {
  tracks: [],
  artists: [],
  playlists: [],
}

type BackendSearchPayload = {
  tracks?: Array<{
    id?: string
    name?: string
    artistName?: string
    artists?: Array<{ id?: string; name?: string }>
    albumCoverUrl?: string
    albumName?: string
    durationMs?: number
  } | null>
  artists?: Array<{
    id?: string
    name?: string
    imageUrl?: string
  } | null>
  playlists?: Array<{
    id?: string
    name?: string
    description?: string
    imageUrl?: string
  } | null>
}

function matchesQuery(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return haystack.toLowerCase().includes(q)
}

/** Catálogo local: curtidas, histórico, recentes, playlists e artistas seguidos. */
function searchLocalCatalog(query: string): SpotifyCatalogSearchResult {
  const tracks: SpotifyTrack[] = []
  const artists: SpotifyArtist[] = []
  const playlists: SpotifyPlaylist[] = []
  const seenTracks = new Set<string>()
  const seenArtists = new Set<string>()

  const pushTrack = (track: {
    id: string
    name: string
    artists?: Array<{ id?: string; name?: string }>
    artistName?: string
    albumCoverUrl?: string
    albumName?: string
    albumReleaseDate?: string
    durationMs?: number
    duration_ms?: number
    album?: {
      name?: string
      release_date?: string
      images?: Array<{ url: string }> | null
    } | null
  }) => {
    if (!track.id || !track.name || seenTracks.has(track.id)) return
    const artistList =
      track.artists && track.artists.length > 0
        ? track.artists
            .filter((a) => Boolean(a.name))
            .map((a, index) => ({
              id: a.id || `local-artist-${track.id}-${index}`,
              name: a.name!,
            }))
        : [
            {
              id: `local-artist-${track.id}`,
              name: track.artistName || 'Artista desconhecido',
            },
          ]

    const blob = `${track.name} ${artistList.map((a) => a.name).join(' ')}`
    if (!matchesQuery(blob, query)) return

    seenTracks.add(track.id)
    tracks.push({
      id: track.id,
      name: track.name,
      artistName: artistList[0]?.name ?? 'Artista desconhecido',
      artists: artistList,
      albumCoverUrl:
        track.albumCoverUrl || track.album?.images?.[0]?.url || '',
      albumName: track.albumName || track.album?.name,
      albumReleaseDate: track.albumReleaseDate || track.album?.release_date,
      durationMs: track.durationMs ?? track.duration_ms ?? 0,
    })

    for (const artist of artistList) {
      if (!artist.id || seenArtists.has(artist.id)) continue
      if (!matchesQuery(artist.name, query) && !matchesQuery(blob, query)) {
        continue
      }
      seenArtists.add(artist.id)
      artists.push({
        id: artist.id,
        name: artist.name,
        imageUrl: track.albumCoverUrl || track.album?.images?.[0]?.url || '',
      })
    }
  }

  for (const liked of getLikedTracks()) {
    pushTrack(liked)
  }

  for (const entry of getListeningHistory()) {
    pushTrack({
      id: entry.trackId,
      name: entry.name,
      artistName: entry.artistName,
      artists: [{ id: entry.artistId, name: entry.artistName }],
      albumCoverUrl: entry.albumCoverUrl,
    })
  }

  for (const recent of getRecentPlays(40)) {
    if (recent.kind !== 'track') {
      if (
        recent.kind === 'artist' &&
        matchesQuery(recent.name, query) &&
        !seenArtists.has(recent.id)
      ) {
        seenArtists.add(recent.id)
        artists.push({
          id: recent.id,
          name: recent.name,
          imageUrl: recent.imageUrl,
        })
      }
      continue
    }
    pushTrack({
      id: recent.id,
      name: recent.name,
      artists: recent.artists,
      albumCoverUrl: recent.imageUrl,
      album: recent.album,
      duration_ms: recent.duration_ms,
    })
  }

  for (const playlist of getPlaylists()) {
    if (matchesQuery(playlist.name, query)) {
      playlists.push({
        id: playlist.id,
        name: playlist.name,
        description: 'Playlist local',
        imageUrl: playlist.coverUrl,
      })
    }
    for (const track of playlist.tracks) {
      pushTrack(track)
    }
  }

  try {
    for (const release of getUserReleases()) {
      if (matchesQuery(release.title, query) || matchesQuery(release.artistName, query)) {
        playlists.push({
          id: release.id,
          name: release.title,
          description: `Estúdio • ${release.artistName}`,
          imageUrl: release.coverUrl || '',
        })
      }
      for (const track of release.tracks) {
        const feats = track.featArtists
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
        pushTrack({
          id: track.id,
          name: track.title,
          artistName: release.artistName,
          artists: [
            { id: `studio-${release.artistName}`, name: release.artistName },
            ...feats.map((name, index) => ({
              id: `studio-feat-${track.id}-${index}`,
              name,
            })),
          ],
          albumCoverUrl: release.coverUrl || '',
          albumName: release.title,
          durationMs: track.durationMs,
        })
      }
    }
  } catch {
    // ignore studio storage failures
  }

  let following: FollowingArtist[] = []
  try {
    following = getFollowingArtists()
  } catch {
    following = []
  }

  for (const artist of following) {
    if (!matchesQuery(artist.name, query) || seenArtists.has(artist.id)) continue
    seenArtists.add(artist.id)
    artists.push({
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl ?? '',
    })
  }

  return {
    tracks: tracks.slice(0, 20),
    artists: artists.slice(0, 12),
    playlists: playlists.slice(0, 8),
  }
}

function mapBackendSearch(
  data: BackendSearchPayload,
): SpotifyCatalogSearchResult {
  const tracks: SpotifyTrack[] = (data.tracks ?? [])
    .filter(
      (item): item is NonNullable<typeof item> =>
        item != null && Boolean(item.id) && Boolean(item.name),
    )
    .map((item) => {
      const artists =
        item.artists && item.artists.length > 0
          ? item.artists
              .filter((a) => Boolean(a.name))
              .map((a, index) => ({
                id: a.id || `be-artist-${item.id}-${index}`,
                name: a.name!,
              }))
          : [
              {
                id: `be-artist-${item.id}`,
                name: item.artistName || 'Artista desconhecido',
              },
            ]

      return {
        id: String(item.id),
        name: item.name!,
        artistName: artists[0]?.name ?? 'Artista desconhecido',
        artists,
        albumCoverUrl: item.albumCoverUrl ?? '',
        albumName: item.albumName,
        durationMs: item.durationMs ?? 0,
      }
    })

  const artists: SpotifyArtist[] = (data.artists ?? [])
    .filter(
      (item): item is NonNullable<typeof item> =>
        item != null && Boolean(item.id) && Boolean(item.name),
    )
    .map((item) => ({
      id: String(item.id),
      name: item.name!,
      imageUrl: item.imageUrl ?? '',
    }))

  const playlists: SpotifyPlaylist[] = (data.playlists ?? [])
    .filter(
      (item): item is NonNullable<typeof item> =>
        item != null && Boolean(item.id) && Boolean(item.name),
    )
    .map((item) => ({
      id: String(item.id),
      name: item.name!,
      description: item.description ?? '',
      imageUrl: item.imageUrl ?? '',
    }))

  return { tracks, artists, playlists }
}

async function fetchBackendSearch(
  query: string,
  signal: AbortSignal,
): Promise<SpotifyCatalogSearchResult> {
  try {
    const response = await fetch(
      `${BACKEND_SEARCH_URL}?q=${encodeURIComponent(query)}`,
      { signal },
    )
    if (!response.ok) return emptyResults
    const data = (await response.json()) as BackendSearchPayload
    return mapBackendSearch(data)
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('Fallback /api/search indisponível:', error)
    return emptyResults
  }
}

function mergeSearchResults(
  ...sources: SpotifyCatalogSearchResult[]
): SpotifyCatalogSearchResult {
  const tracks: SpotifyTrack[] = []
  const artists: SpotifyArtist[] = []
  const playlists: SpotifyPlaylist[] = []
  const seenTracks = new Set<string>()
  const seenArtists = new Set<string>()
  const seenPlaylists = new Set<string>()

  for (const source of sources) {
    for (const track of source.tracks) {
      if (!track.id || seenTracks.has(track.id)) continue
      seenTracks.add(track.id)
      tracks.push(track)
    }
    for (const artist of source.artists) {
      if (!artist.id || seenArtists.has(artist.id)) continue
      seenArtists.add(artist.id)
      artists.push(artist)
    }
    for (const playlist of source.playlists) {
      if (!playlist.id || seenPlaylists.has(playlist.id)) continue
      seenPlaylists.add(playlist.id)
      playlists.push(playlist)
    }
  }

  return {
    tracks: tracks.slice(0, 30),
    artists: artists.slice(0, 16),
    playlists: playlists.slice(0, 10),
  }
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fromUrl = searchParams.get('q')?.trim() ?? ''
    setQuery(fromUrl)
    setDebouncedQuery(fromUrl)
  }, [searchParams])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

    const controller = new AbortController()

    async function runSearch() {
      try {
        setIsLoading(true)
        setError(null)

        const local = searchLocalCatalog(debouncedQuery)
        // Mostra catálogo local imediatamente (mesmo sob rate limit)
        if (
          local.tracks.length > 0 ||
          local.artists.length > 0 ||
          local.playlists.length > 0
        ) {
          setResults(local)
        }

        const [spotifySettled, backendSettled] = await Promise.allSettled([
          isSpotifyCoolingDown()
            ? Promise.resolve(emptyResults)
            : searchCatalog(debouncedQuery),
          fetchBackendSearch(debouncedQuery, controller.signal),
        ])

        if (controller.signal.aborted) return

        const spotify =
          spotifySettled.status === 'fulfilled'
            ? spotifySettled.value
            : emptyResults
        const backend =
          backendSettled.status === 'fulfilled'
            ? backendSettled.value
            : emptyResults

        const merged = mergeSearchResults(local, spotify, backend)
        setResults(merged)
      } catch (err) {
        if (controller.signal.aborted) return
        const local = searchLocalCatalog(debouncedQuery)
        setResults(local)
        if (
          local.tracks.length === 0 &&
          local.artists.length === 0 &&
          local.playlists.length === 0
        ) {
          setError(err instanceof Error ? err.message : 'Erro na pesquisa')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void runSearch()

    return () => {
      controller.abort()
    }
  }, [debouncedQuery])

  const hasResults =
    results.tracks.length > 0 ||
    results.artists.length > 0 ||
    results.playlists.length > 0

  return (
    <main className="pointer-events-auto relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-[#1E293B] to-[#0B0F19]">
      <header className="pointer-events-auto px-4 pb-2 pt-2 md:px-8 md:pt-4">
        <h2 className="mb-4 text-3xl font-bold text-[#F8FAFC]">Pesquisar</h2>
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar músicas, artistas e playlists</span>
          <SearchIcon
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#94A3B8]"
            strokeWidth={ICON_STROKE}
          />
          <input
            ref={inputRef}
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setDebouncedQuery(query.trim())
              }
            }}
            placeholder="O que você quer ouvir?"
            className="pointer-events-auto relative z-20 w-full rounded-full border border-white/10 bg-[#111827] py-3 pl-12 pr-4 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8] outline-none transition-colors focus:border-[#00E5FF]/60 focus:ring-2 focus:ring-[#00E5FF]/30"
          />
        </label>
      </header>

      <div className="space-y-8 px-4 py-6 md:px-8">
        {!debouncedQuery && (
          <p className="text-sm text-[#94A3B8]">
            Digite um artista, música ou playlist para começar.
          </p>
        )}

        {debouncedQuery && isLoading && !hasResults && (
          <p className="text-sm text-[#94A3B8]">A pesquisar...</p>
        )}

        {debouncedQuery && !isLoading && error && !hasResults && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {debouncedQuery && !isLoading && !error && !hasResults && (
          <p className="text-sm text-[#94A3B8]">
            Nenhum resultado para &ldquo;{debouncedQuery}&rdquo;.
          </p>
        )}

        {debouncedQuery && hasResults && (
          <>
            {isLoading && (
              <p className="text-sm text-[#94A3B8]">
                A complementar resultados...
              </p>
            )}
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
