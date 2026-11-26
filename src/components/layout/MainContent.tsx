import { Play, Plus, User } from 'lucide-react'
import {
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  pushRecentPlay,
  toggleLikedTrack,
  type RecentPlayItem,
  type UserPlaylist,
} from '../../services/libraryStorage'
import type {
  BecauseYouListened,
  FeaturedRelease,
  PersonalizedMix,
  SuggestedArtist,
} from '../../services/recommendationService'
import type { SpotifyTrack } from '../../services/spotify'
import {
  usePlayerStore,
  type PlayerTrack,
} from '../../store/usePlayerStore'
import { RightSidebar } from './RightSidebar'

const ICON_STROKE = 1.5

type HomeFilter = 'tudo' | 'musicas' | 'artistas' | 'playlists'

type ShortcutItem = {
  id: string
  title: string
  imageUrl: string
  kind: 'playlist' | 'track' | 'artist'
  href?: string
  track?: PlayerTrack
  artistName?: string
}

interface MainContentProps {
  libraryPlaylists: UserPlaylist[]
  recentPlays: RecentPlayItem[]
  featuredRelease: FeaturedRelease | null
  personalizedMixes: PersonalizedMix[]
  becauseYouListened: BecauseYouListened | null
  suggestedArtists: SuggestedArtist[]
  newTracks: SpotifyTrack[]
  isLoading: boolean
  error: string | null
  userHandle?: string
  refreshControl?: ReactNode
}

const FILTERS: { id: HomeFilter; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'musicas', label: 'Músicas' },
  { id: 'artistas', label: 'Artistas' },
  { id: 'playlists', label: 'Playlists' },
]

const MIX_BADGES = [
  {
    label: 'MIX 01',
    className: 'bg-cyan-400 text-[#0B0F19]',
    glow: 'shadow-[0_0_18px_rgba(34,211,238,0.45)]',
  },
  {
    label: 'MIX 02',
    className: 'bg-fuchsia-500 text-white',
    glow: 'shadow-[0_0_18px_rgba(217,70,239,0.45)]',
  },
  {
    label: 'MIX 03',
    className: 'bg-blue-500 text-white',
    glow: 'shadow-[0_0_18px_rgba(59,130,246,0.45)]',
  },
  {
    label: 'MIX 04',
    className: 'bg-emerald-400 text-[#0B0F19]',
    glow: 'shadow-[0_0_18px_rgba(52,211,153,0.45)]',
  },
  {
    label: 'MIX 05',
    className: 'bg-rose-400 text-[#0B0F19]',
    glow: 'shadow-[0_0_18px_rgba(251,113,133,0.45)]',
  },
] as const

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

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

function MiniWaveform() {
  const bars = [32, 58, 44, 78, 50, 92, 38, 70, 55, 86, 42, 64, 80, 48, 74, 36, 88]
  return (
    <div className="flex h-8 w-full max-w-xs items-end gap-[3px]" aria-hidden>
      {bars.map((height, index) => (
        <span
          key={index}
          className="w-1 rounded-sm bg-gradient-to-t from-cyan-600 to-cyan-300"
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  )
}

function PlayPillButton({
  label,
  onClick,
}: {
  label: string
  onClick: (event: MouseEvent) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event)
      }}
      className="flex size-10 shrink-0 translate-y-1 items-center justify-center rounded-full bg-cyan-400 text-[#0B0F19] opacity-0 shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all group-hover:translate-y-0 group-hover:opacity-100"
    >
      <Play
        className="size-4 translate-x-px"
        strokeWidth={ICON_STROKE}
        fill="currentColor"
      />
    </button>
  )
}

function activateOnEnterOrSpace(
  event: KeyboardEvent<HTMLDivElement>,
  activate: () => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  activate()
}

export function MainContent({
  libraryPlaylists,
  recentPlays,
  featuredRelease,
  personalizedMixes,
  becauseYouListened,
  suggestedArtists,
  newTracks,
  isLoading,
  error,
  userHandle,
  refreshControl,
}: MainContentProps) {
  const navigate = useNavigate()
  const playTrack = usePlayerStore((state) => state.playTrack)
  const [activeFilter, setActiveFilter] = useState<HomeFilter>('tudo')
  const [libraryToast, setLibraryToast] = useState<string | null>(null)

  const spotlightTrack = featuredRelease?.track ?? null
  const artists = suggestedArtists

  const shortcuts = useMemo(
    () =>
      buildShortcuts({
        libraryPlaylists,
        recentTracks: newTracks,
        artists,
        recentPlays,
        activeFilter,
      }),
    [libraryPlaylists, newTracks, artists, recentPlays, activeFilter],
  )

  const hybridRecent = useMemo(
    () =>
      buildHybridRecent({
        recentPlays,
        recentTracks: newTracks,
        artists,
      }),
    [recentPlays, newTracks, artists],
  )

  const showFeatured =
    (activeFilter === 'tudo' || activeFilter === 'musicas') && spotlightTrack
  const showMix =
    (activeFilter === 'tudo' || activeFilter === 'playlists') &&
    personalizedMixes.length > 0
  const showBecauseYouListened =
    (activeFilter === 'tudo' || activeFilter === 'musicas') &&
    becauseYouListened != null &&
    becauseYouListened.tracks.length > 0
  const showRecent =
    activeFilter === 'tudo' ||
    activeFilter === 'musicas' ||
    activeFilter === 'artistas'

  async function handlePlayTrack(track: PlayerTrack, queue?: PlayerTrack[]) {
    await playTrack(track, queue)
  }

  function handlePlayMix(mix: PersonalizedMix) {
    if (mix.tracks.length === 0) return
    const queue = mix.tracks.map(toPlayerTrack)
    void handlePlayTrack(queue[0], queue)
  }

  function handleShortcutActivate(item: ShortcutItem) {
    if (item.kind === 'track' && item.track) {
      void handlePlayTrack(item.track, [item.track])
      return
    }
    if (item.kind === 'artist' && item.href) {
      const artistId = item.id.replace(/^artist-/, '')
      pushRecentPlay({
        kind: 'artist',
        id: artistId,
        name: item.title,
        imageUrl: item.imageUrl,
      })
      navigate(item.href, { state: { artistName: item.title } })
      return
    }
    if (item.href) navigate(item.href)
  }

  function handleAddSpotlightToLibrary() {
    if (!spotlightTrack) return
    const liked = toggleLikedTrack(toPlayerTrack(spotlightTrack))
    setLibraryToast(liked ? 'Adicionada à biblioteca' : 'Removida da biblioteca')
    window.setTimeout(() => setLibraryToast(null), 1800)
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#0B0F19]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent"
        aria-hidden
      />

      <header className="relative z-10 px-4 pb-2 pt-2 md:px-8 md:pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-2xl sm:text-3xl font-bold text-white flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span>{getGreeting()}</span>
            {userHandle ? (
              <Link
                to="/profile"
                className="text-cyan-400 hover:text-cyan-300 font-semibold text-xl sm:text-2xl tracking-tight drop-shadow-[0_0_12px_rgba(34,211,238,0.35)] transition-colors truncate max-w-[220px] sm:max-w-none"
              >
                {userHandle}
              </Link>
            ) : null}
          </h1>
          {refreshControl}
        </div>
        <div className="no-scrollbar mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.id
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-cyan-400 font-bold text-[#0B0F19]'
                    : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                }`}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </header>

      <div className="relative z-10 space-y-8 px-4 py-4 md:px-8">
        {isLoading && (
          <p className="text-sm text-[#94A3B8]">Carregando sua home...</p>
        )}

        {!isLoading && error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {!isLoading && !error && (
          <>
            <section>
              <h3 className="mb-3 text-lg font-semibold text-[#F8FAFC]">
                Atalhos rápidos
              </h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 md:gap-3 lg:grid-cols-3">
                {shortcuts.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleShortcutActivate(item)}
                    onKeyDown={(event) =>
                      activateOnEnterOrSpace(event, () =>
                        handleShortcutActivate(item),
                      )
                    }
                    className="group flex h-16 cursor-pointer items-center gap-3 overflow-hidden rounded-xl border border-white/5 bg-white/5 pr-4 transition-all hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className={`h-full w-16 shrink-0 object-cover ${
                          item.kind === 'artist' ? 'rounded-none' : ''
                        }`}
                      />
                    ) : (
                      <div className="flex h-full w-16 shrink-0 items-center justify-center bg-[#111827]">
                        <User className="size-5 text-[#94A3B8]" strokeWidth={ICON_STROKE} />
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[#F8FAFC]">
                      {item.title}
                    </span>
                    <PlayPillButton
                      label={`Reproduzir ${item.title}`}
                      onClick={() => handleShortcutActivate(item)}
                    />
                  </div>
                ))}
              </div>
            </section>

            {showFeatured && spotlightTrack && (
              <section>
                <article className="flex flex-col items-start gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-[#111827] via-[#131C2E] to-cyan-950/30 p-4 sm:flex-row sm:items-center md:p-5">
                  {spotlightTrack.albumCoverUrl ? (
                    <img
                      src={spotlightTrack.albumCoverUrl}
                      alt={spotlightTrack.name}
                      className="h-44 w-full shrink-0 rounded-xl object-cover shadow-2xl sm:h-36 sm:w-36"
                    />
                  ) : (
                    <div className="h-44 w-full shrink-0 rounded-xl bg-[#0B0F19] shadow-2xl sm:h-36 sm:w-36" />
                  )}

                  <div className="flex min-w-0 flex-1 flex-col items-start gap-3 text-left">
                    <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                      {featuredRelease?.badgeReason ?? 'Lançamento em destaque'}
                    </span>
                    <h3 className="text-2xl font-bold text-[#F8FAFC] sm:text-3xl">
                      {spotlightTrack.name}
                    </h3>
                    <p className="text-sm text-[#94A3B8]">
                      {spotlightTrack.artists.map((artist, index) => (
                        <span key={`${artist.id}-${artist.name}`}>
                          {index > 0 && ', '}
                          {artist.id ? (
                            <Link
                              to={`/artist/${artist.id}`}
                              state={{ artistName: artist.name }}
                              className="transition-colors hover:text-cyan-400 hover:underline"
                            >
                              {artist.name}
                            </Link>
                          ) : (
                            artist.name
                          )}
                        </span>
                      ))}
                    </p>

                    <MiniWaveform />

                    <div className="mt-1 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          void handlePlayTrack(
                            toPlayerTrack(spotlightTrack),
                            [toPlayerTrack(spotlightTrack)],
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-bold text-[#0B0F19] shadow-[0_0_18px_rgba(34,211,238,0.35)] transition-transform hover:scale-[1.02]"
                      >
                        <Play
                          className="size-4 translate-x-px"
                          strokeWidth={ICON_STROKE}
                          fill="currentColor"
                        />
                        Play
                      </button>
                      <button
                        type="button"
                        onClick={handleAddSpotlightToLibrary}
                        aria-label="Adicionar à biblioteca"
                        className="inline-flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[#F8FAFC] transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
                      >
                        <Plus className="size-5" strokeWidth={ICON_STROKE} />
                      </button>
                    </div>
                    {libraryToast && (
                      <p className="text-xs text-cyan-300">{libraryToast}</p>
                    )}
                  </div>
                </article>
              </section>
            )}

            {showMix && (
              <section>
                <div className="mb-3 flex items-end justify-between gap-4">
                  <h3 className="text-xl font-bold text-[#F8FAFC]">
                    Mixado para você
                  </h3>
                </div>
                <div className="no-scrollbar flex snap-x gap-3.5 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 lg:grid-cols-5">
                  {personalizedMixes.slice(0, 5).map((mix, index) => {
                    const badge = MIX_BADGES[index] ?? MIX_BADGES[0]
                    return (
                      <button
                        key={`mix-${mix.id}`}
                        type="button"
                        onClick={() => handlePlayMix(mix)}
                        className="group min-w-[145px] shrink-0 snap-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:min-w-[165px] md:min-w-0"
                      >
                        <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-[#111827]">
                          {mix.imageUrl ? (
                            <img
                              src={mix.imageUrl}
                              alt={mix.name}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="h-full w-full bg-[#111827]" />
                          )}
                          <span
                            className={`absolute bottom-2 left-2 rounded-md px-2 py-1 text-[10px] font-black tracking-wide ${badge.className} ${badge.glow}`}
                          >
                            {badge.label}
                          </span>
                          <span className="absolute bottom-2 right-2 flex size-10 translate-y-1 items-center justify-center rounded-full bg-cyan-400 text-[#0B0F19] opacity-0 shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all group-hover:translate-y-0 group-hover:opacity-100">
                            <Play
                              className="size-4 translate-x-px"
                              strokeWidth={ICON_STROKE}
                              fill="currentColor"
                            />
                          </span>
                        </div>
                        <h4 className="truncate text-sm font-semibold text-[#F8FAFC]">
                          {mix.name}
                        </h4>
                        <p className="mt-1 truncate text-xs text-[#94A3B8]">
                          {mix.description || 'Mix personalizado Azuri'}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showBecauseYouListened && becauseYouListened && (
              <section>
                <h3 className="mb-3 text-xl font-bold text-[#F8FAFC]">
                  Porque você ouviu {becauseYouListened.seedArtistName}
                </h3>
                <div className="no-scrollbar flex snap-x gap-3.5 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 lg:grid-cols-5">
                  {becauseYouListened.tracks.slice(0, 8).map((track) => {
                    const playerTrack = toPlayerTrack(track)
                    const queue = becauseYouListened.tracks.map(toPlayerTrack)
                    return (
                      <button
                        key={`because-${track.id}`}
                        type="button"
                        onClick={() => void handlePlayTrack(playerTrack, queue)}
                        className="group min-w-[145px] shrink-0 snap-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:min-w-[165px] md:min-w-0"
                      >
                        <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-[#111827]">
                          {track.albumCoverUrl ? (
                            <img
                              src={track.albumCoverUrl}
                              alt={track.name}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="h-full w-full bg-[#111827]" />
                          )}
                          <span className="absolute bottom-2 right-2 flex size-10 translate-y-1 items-center justify-center rounded-full bg-cyan-400 text-[#0B0F19] opacity-0 shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all group-hover:translate-y-0 group-hover:opacity-100">
                            <Play
                              className="size-4 translate-x-px"
                              strokeWidth={ICON_STROKE}
                              fill="currentColor"
                            />
                          </span>
                        </div>
                        <h4 className="truncate text-sm font-semibold text-[#F8FAFC]">
                          {track.name}
                        </h4>
                        <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                          {track.artistName}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {showRecent && hybridRecent.length > 0 && (
              <section>
                <h3 className="mb-3 text-xl font-bold text-[#F8FAFC]">
                  Recém reproduzido
                </h3>
                <div className="no-scrollbar flex snap-x gap-3.5 overflow-x-auto pb-2 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 lg:grid-cols-5">
                  {hybridRecent
                    .filter((item) => {
                      if (activeFilter === 'musicas') return item.kind === 'track'
                      if (activeFilter === 'artistas') return item.kind === 'artist'
                      return true
                    })
                    .map((item) =>
                      item.kind === 'artist' ? (
                        <button
                          key={`recent-artist-${item.id}`}
                          type="button"
                          onClick={() => {
                            pushRecentPlay({
                              kind: 'artist',
                              id: item.id,
                              name: item.name,
                              imageUrl: item.imageUrl,
                            })
                            navigate(`/artist/${item.id}`, {
                              state: { artistName: item.name },
                            })
                          }}
                          className="group min-w-[145px] shrink-0 snap-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:min-w-[165px] md:min-w-0"
                        >
                          <div className="relative mx-auto mb-3 aspect-square w-full max-w-[9rem]">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-full w-full rounded-full object-cover shadow-lg transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#111827]">
                                <User
                                  className="size-10 text-[#94A3B8]"
                                  strokeWidth={ICON_STROKE}
                                />
                              </div>
                            )}
                          </div>
                          <h4 className="truncate text-center text-sm font-semibold text-[#F8FAFC]">
                            {item.name}
                          </h4>
                          <p className="mt-0.5 text-center text-xs text-[#94A3B8]">
                            Artista
                          </p>
                        </button>
                      ) : (
                        <button
                          key={`recent-track-${item.id}`}
                          type="button"
                          onClick={() => void handlePlayTrack(item.track, [item.track])}
                          className="group min-w-[145px] shrink-0 snap-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 sm:min-w-[165px] md:min-w-0"
                        >
                          <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-[#111827]">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="h-full w-full bg-[#111827]" />
                            )}
                            <span className="absolute bottom-2 right-2 flex size-10 translate-y-1 items-center justify-center rounded-full bg-cyan-400 text-[#0B0F19] opacity-0 shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all group-hover:translate-y-0 group-hover:opacity-100">
                              <Play
                                className="size-4 translate-x-px"
                                strokeWidth={ICON_STROKE}
                                fill="currentColor"
                              />
                            </span>
                          </div>
                          <h4 className="truncate text-sm font-semibold text-[#F8FAFC]">
                            {item.name}
                          </h4>
                          <p className="mt-0.5 truncate text-xs text-[#94A3B8]">
                            {item.subtitle}
                          </p>
                        </button>
                      ),
                    )}
                </div>
              </section>
            )}

          </>
        )}

        <RightSidebar
          variant="stack"
          artists={suggestedArtists}
          newTracks={newTracks.slice(0, 6)}
        />
      </div>
    </main>
  )
}

function buildShortcuts({
  libraryPlaylists,
  recentTracks,
  artists,
  recentPlays,
  activeFilter,
}: {
  libraryPlaylists: UserPlaylist[]
  recentTracks: SpotifyTrack[]
  artists: SuggestedArtist[]
  recentPlays: RecentPlayItem[]
  activeFilter: HomeFilter
}): ShortcutItem[] {
  const items: ShortcutItem[] = []
  const seen = new Set<string>()

  const pushUnique = (item: ShortcutItem) => {
    if (seen.has(item.id) || items.length >= 6) return
    seen.add(item.id)
    items.push(item)
  }

  const allowPlaylist =
    activeFilter === 'tudo' || activeFilter === 'playlists'
  const allowTrack = activeFilter === 'tudo' || activeFilter === 'musicas'
  const allowArtist = activeFilter === 'tudo' || activeFilter === 'artistas'

  if (allowPlaylist) {
    for (const playlist of libraryPlaylists) {
      pushUnique({
        id: `lib-${playlist.id}`,
        title: playlist.name,
        imageUrl: playlist.coverUrl,
        kind: 'playlist',
        href: `/playlist/${playlist.id}`,
      })
    }
  }

  if (allowTrack) {
    for (const play of recentPlays) {
      if (play.kind !== 'track') continue
      pushUnique({
        id: `recent-track-${play.id}`,
        title: play.name,
        imageUrl: play.imageUrl,
        kind: 'track',
        track: {
          id: play.id,
          name: play.name,
          artists: play.artists,
          album: play.album,
          duration_ms: play.duration_ms,
        },
      })
    }

    for (const track of recentTracks) {
      pushUnique({
        id: `track-${track.id}`,
        title: track.name,
        imageUrl: track.albumCoverUrl,
        kind: 'track',
        track: toPlayerTrack(track),
        artistName: track.artistName,
      })
    }
  }

  if (allowArtist) {
    for (const play of recentPlays) {
      if (play.kind !== 'artist') continue
      pushUnique({
        id: `artist-${play.id}`,
        title: play.name,
        imageUrl: play.imageUrl,
        kind: 'artist',
        href: `/artist/${play.id}`,
      })
    }

    for (const artist of artists) {
      pushUnique({
        id: `artist-${artist.id}`,
        title: artist.name,
        imageUrl: artist.imageUrl,
        kind: 'artist',
        href: `/artist/${artist.id}`,
      })
    }
  }

  // Preenche até 6 para grade simétrica (sem buracos), respeitando o filtro
  const fillers: ShortcutItem[] = []

  if (allowPlaylist) {
    for (const playlist of libraryPlaylists) {
      fillers.push({
        id: `fill-lib-${playlist.id}`,
        title: playlist.name,
        imageUrl: playlist.coverUrl,
        kind: 'playlist',
        href: `/playlist/${playlist.id}`,
      })
    }
  }

  if (allowTrack) {
    for (const track of recentTracks) {
      fillers.push({
        id: `fill-track-${track.id}`,
        title: track.name,
        imageUrl: track.albumCoverUrl,
        kind: 'track',
        track: toPlayerTrack(track),
      })
    }
  }

  if (allowArtist) {
    for (const artist of artists) {
      fillers.push({
        id: `fill-artist-${artist.id}`,
        title: artist.name,
        imageUrl: artist.imageUrl,
        kind: 'artist',
        href: `/artist/${artist.id}`,
      })
    }
  }

  for (const filler of fillers) {
    if (items.length >= 6) break
    pushUnique({ ...filler, id: `pad-${filler.id}` })
  }

  while (items.length < 6) {
    items.push({
      id: `placeholder-${items.length}`,
      title: 'Explorar Azuri',
      imageUrl: '',
      kind: 'playlist',
      href: '/search',
    })
  }

  return items.slice(0, 6)
}

type HybridRecentItem =
  | {
      kind: 'track'
      id: string
      name: string
      imageUrl: string
      subtitle: string
      track: PlayerTrack
    }
  | {
      kind: 'artist'
      id: string
      name: string
      imageUrl: string
    }

function buildHybridRecent({
  recentPlays,
  recentTracks,
  artists,
}: {
  recentPlays: RecentPlayItem[]
  recentTracks: SpotifyTrack[]
  artists: SuggestedArtist[]
}): HybridRecentItem[] {
  const items: HybridRecentItem[] = []
  const seen = new Set<string>()

  for (const play of recentPlays) {
    const key = `${play.kind}-${play.id}`
    if (seen.has(key)) continue
    seen.add(key)

    if (play.kind === 'track') {
      items.push({
        kind: 'track',
        id: play.id,
        name: play.name,
        imageUrl: play.imageUrl,
        subtitle: play.artists.map((a) => a.name).join(', ') || 'Faixa',
        track: {
          id: play.id,
          name: play.name,
          artists: play.artists,
          album: play.album,
          duration_ms: play.duration_ms,
        },
      })
    } else {
      items.push({
        kind: 'artist',
        id: play.id,
        name: play.name,
        imageUrl: play.imageUrl,
      })
    }
  }

  // Intercala faixas e artistas do catálogo para manter o layout híbrido
  const max = 10
  let trackIndex = 0
  let artistIndex = 0
  while (items.length < max && (trackIndex < recentTracks.length || artistIndex < artists.length)) {
    if (trackIndex < recentTracks.length) {
      const track = recentTracks[trackIndex++]
      const key = `track-${track.id}`
      if (!seen.has(key)) {
        seen.add(key)
        items.push({
          kind: 'track',
          id: track.id,
          name: track.name,
          imageUrl: track.albumCoverUrl,
          subtitle: track.artistName,
          track: toPlayerTrack(track),
        })
      }
    }

    if (items.length >= max) break

    if (artistIndex < artists.length) {
      const artist = artists[artistIndex++]
      const key = `artist-${artist.id}`
      if (!seen.has(key)) {
        seen.add(key)
        items.push({
          kind: 'artist',
          id: artist.id,
          name: artist.name,
          imageUrl: artist.imageUrl,
        })
      }
    }
  }

  return items
}
