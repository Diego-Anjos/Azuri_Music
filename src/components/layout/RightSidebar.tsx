import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getFollowingArtistIds,
  getRecentLikedTracks,
  subscribeLibraryUpdates,
  toggleFollowArtist,
  type LikedTrackEntry,
} from '../../services/libraryStorage'
import type { SuggestedArtist } from '../../services/recommendationService'
import type { SpotifyArtist, SpotifyTrack } from '../../services/spotify'
import {
  usePlayerStore,
  type PlayerTrack,
} from '../../store/usePlayerStore'

const ICON_STROKE = 1.5

type RightSidebarProps = {
  artists?: Array<SpotifyArtist | SuggestedArtist>
  newTracks?: SpotifyTrack[]
  /** rail = coluna direita (xl+); stack = abaixo do feed (< xl) */
  variant?: 'rail' | 'stack'
}

function getArtistGenreTag(artist: SpotifyArtist | SuggestedArtist): string {
  if ('genreTag' in artist && artist.genreTag) return artist.genreTag
  return 'Artista'
}

const FALLBACK_TRACKS: SpotifyTrack[] = [
  {
    id: 'fallback-1',
    name: 'Neon Pulse',
    artistName: 'Azuri Lab',
    artists: [{ id: 'a1', name: 'Azuri Lab' }],
    albumCoverUrl: 'https://picsum.photos/seed/azuri-new-1/80/80',
    durationMs: 180000,
  },
  {
    id: 'fallback-2',
    name: 'Cyan Drift',
    artistName: 'Orbit Lane',
    artists: [{ id: 'a2', name: 'Orbit Lane' }],
    albumCoverUrl: 'https://picsum.photos/seed/azuri-new-2/80/80',
    durationMs: 200000,
  },
  {
    id: 'fallback-3',
    name: 'Glass City',
    artistName: 'Soft Circuit',
    artists: [{ id: 'a3', name: 'Soft Circuit' }],
    albumCoverUrl: 'https://picsum.photos/seed/azuri-new-3/80/80',
    durationMs: 210000,
  },
  {
    id: 'fallback-4',
    name: 'Afterglow',
    artistName: 'Velvet Static',
    artists: [{ id: 'a4', name: 'Velvet Static' }],
    albumCoverUrl: 'https://picsum.photos/seed/azuri-new-4/80/80',
    durationMs: 195000,
  },
  {
    id: 'fallback-5',
    name: 'Signal Bloom',
    artistName: 'Nova Echo',
    artists: [{ id: 'a5', name: 'Nova Echo' }],
    albumCoverUrl: 'https://picsum.photos/seed/azuri-new-5/80/80',
    durationMs: 188000,
  },
  {
    id: 'fallback-6',
    name: 'Night Circuit',
    artistName: 'Cyan Drift',
    artists: [{ id: 'a6', name: 'Cyan Drift' }],
    albumCoverUrl: 'https://picsum.photos/seed/azuri-new-6/80/80',
    durationMs: 204000,
  },
]

const FALLBACK_ARTISTS: SpotifyArtist[] = [
  {
    id: 'suggested-1',
    name: 'Nova Echo',
    imageUrl: 'https://picsum.photos/seed/artist-1/96/96',
  },
  {
    id: 'suggested-2',
    name: 'Cyan Drift',
    imageUrl: 'https://picsum.photos/seed/artist-2/96/96',
  },
  {
    id: 'suggested-3',
    name: 'Orbit Lane',
    imageUrl: 'https://picsum.photos/seed/artist-3/96/96',
  },
  {
    id: 'suggested-4',
    name: 'Velvet Static',
    imageUrl: 'https://picsum.photos/seed/artist-4/96/96',
  },
  {
    id: 'suggested-5',
    name: 'Soft Circuit',
    imageUrl: 'https://picsum.photos/seed/artist-5/96/96',
  },
]

function toPlayerTrack(track: SpotifyTrack | LikedTrackEntry): PlayerTrack {
  if ('albumCoverUrl' in track) {
    return {
      id: track.id,
      name: track.name,
      artists:
        track.artists.length > 0
          ? track.artists
          : [{ name: track.artistName }],
      album: {
        name: track.albumName,
        release_date: track.albumReleaseDate,
        images: track.albumCoverUrl ? [{ url: track.albumCoverUrl }] : [],
      },
      duration_ms: track.durationMs,
    }
  }

  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    album: track.album,
    duration_ms: track.duration_ms,
  }
}

export function RightSidebar({
  artists = [],
  newTracks = [],
  variant = 'rail',
}: RightSidebarProps) {
  const playTrack = usePlayerStore((state) => state.playTrack)
  const [followingIds, setFollowingIds] = useState<string[]>(() =>
    getFollowingArtistIds(),
  )
  const [likedTracks, setLikedTracks] = useState<LikedTrackEntry[]>(() =>
    getRecentLikedTracks(4),
  )

  useEffect(() => {
    return subscribeLibraryUpdates(() => {
      setFollowingIds(getFollowingArtistIds())
      setLikedTracks(getRecentLikedTracks(4))
    })
  }, [])

  const displayTracks =
    newTracks.length > 0 ? newTracks.slice(0, 6) : FALLBACK_TRACKS
  const displayArtists =
    artists.length > 0 ? artists.slice(0, 5) : FALLBACK_ARTISTS
  const isStack = variant === 'stack'

  function handleToggleFollow(artist: SpotifyArtist) {
    const next = toggleFollowArtist({
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
    })
    setFollowingIds((prev) =>
      next ? [...prev, artist.id] : prev.filter((id) => id !== artist.id),
    )
  }

  const content = (
    <>
      <section>
        <h2 className="mb-4 text-sm font-semibold text-[#F8FAFC]">Novas Faixas</h2>
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
          {displayTracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() =>
                void playTrack(toPlayerTrack(track), [toPlayerTrack(track)])
              }
              className={`group flex shrink-0 flex-col items-center gap-2 transition-transform hover:scale-105 ${
                isStack ? 'w-20' : 'w-14'
              }`}
              aria-label={`Reproduzir ${track.name}`}
            >
              <img
                src={
                  track.albumCoverUrl ||
                  'https://picsum.photos/seed/azuri-fallback/80/80'
                }
                alt=""
                className={`rounded-full object-cover ring-2 ring-cyan-400/70 ring-offset-2 ring-offset-[#0B0F19] ${
                  isStack ? 'size-16' : 'size-12'
                }`}
              />
              <span className="w-full truncate text-center text-[10px] text-[#94A3B8] group-hover:text-[#F8FAFC]">
                {track.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 pt-5">
        <h2 className="mb-4 text-sm font-semibold text-[#F8FAFC]">
          Artistas que você deveria seguir
        </h2>
        <ul className="space-y-4">
          {displayArtists.map((artist) => {
            const isFollowing = followingIds.includes(artist.id)

            return (
              <li key={artist.id} className="flex items-center gap-3">
                <Link
                  to={`/artist/${artist.id}`}
                  state={{ artistName: artist.name }}
                  className="shrink-0"
                >
                  <img
                    src={
                      artist.imageUrl ||
                      'https://picsum.photos/seed/azuri-artist/96/96'
                    }
                    alt={artist.name}
                    className="size-11 rounded-full object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/artist/${artist.id}`}
                    state={{ artistName: artist.name }}
                    className="block truncate text-sm font-medium text-[#F8FAFC] transition-colors hover:text-cyan-400"
                  >
                    {artist.name}
                  </Link>
                  <p className="truncate text-xs text-[#94A3B8]">
                    {getArtistGenreTag(artist)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleFollow(artist)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isFollowing
                      ? 'border border-cyan-400 bg-transparent text-cyan-400'
                      : 'bg-cyan-400 text-[#0B0F19] hover:bg-cyan-300'
                  }`}
                >
                  {isFollowing ? 'Seguindo' : 'Seguir'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="border-t border-white/10 pt-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#F8FAFC]">
            Curtidas recentes
          </h2>
          <Link
            to="/library"
            className="text-xs font-medium text-[#94A3B8] transition-colors hover:text-cyan-400"
          >
            Ver todas
          </Link>
        </div>

        {likedTracks.length === 0 ? (
          <p className="text-xs text-[#94A3B8]">
            Suas curtidas aparecerão aqui.
          </p>
        ) : (
          <ul className="space-y-2">
            {likedTracks.map((track) => {
              const cover = track.album?.images?.[0]?.url
              const artistLabel =
                track.artists.map((artist) => artist.name).join(', ') ||
                'Artista'

              return (
                <li key={track.id}>
                  <div className="group flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-white/5">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-md bg-[#0B0F19]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#F8FAFC]">
                        {track.name}
                      </p>
                      <p className="truncate text-xs text-[#94A3B8]">
                        {artistLabel}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Reproduzir ${track.name}`}
                      onClick={() =>
                        void playTrack(toPlayerTrack(track), [
                          toPlayerTrack(track),
                        ])
                      }
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-[#0B0F19] opacity-0 shadow-[0_0_12px_rgba(34,211,238,0.45)] transition-all group-hover:opacity-100"
                    >
                      <Play
                        className="size-3.5 translate-x-px"
                        strokeWidth={ICON_STROKE}
                        fill="currentColor"
                      />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )

  if (isStack) {
    return (
      <div className="-mx-4 space-y-6 border-t border-white/10 px-4 pt-8 md:-mx-8 md:px-8 xl:hidden">
        {content}
      </div>
    )
  }

  return (
    <aside className="hidden h-full w-72 shrink-0 flex-col gap-6 overflow-y-auto border-l border-white/10 bg-[#111827] px-5 py-6 xl:flex xl:w-80">
      {content}
    </aside>
  )
}
