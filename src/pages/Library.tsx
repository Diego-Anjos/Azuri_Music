import { Heart, ListMusic, Play, Plus, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CreatePlaylistModal } from '../components/CreatePlaylistModal'
import {
  LIBRARY_UPDATED_EVENT,
  getFollowingArtists,
  getLikedTracks,
  getPlaylists,
  subscribeLibraryUpdates,
  type FollowingArtist,
  type LikedTrackEntry,
  type UserPlaylist,
} from '../services/libraryStorage'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5

export function Library() {
  const navigate = useNavigate()
  const playTrack = usePlayerStore((state) => state.playTrack)
  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() => getPlaylists())
  const [likedTracks, setLikedTracks] = useState<LikedTrackEntry[]>(() =>
    getLikedTracks(),
  )
  const [following, setFollowing] = useState<FollowingArtist[]>(() =>
    getFollowingArtists(),
  )
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    function reloadLibrary() {
      setPlaylists(getPlaylists())
      setLikedTracks(getLikedTracks())
      setFollowing(getFollowingArtists())
    }

    reloadLibrary()

    window.addEventListener(LIBRARY_UPDATED_EVENT, reloadLibrary)
    window.addEventListener('storage', reloadLibrary)
    const unsubscribe = subscribeLibraryUpdates(reloadLibrary)

    return () => {
      window.removeEventListener(LIBRARY_UPDATED_EVENT, reloadLibrary)
      window.removeEventListener('storage', reloadLibrary)
      unsubscribe()
    }
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-[#1E293B] to-[#0B0F19] pb-36 md:pb-32">
      <header className="px-3 pb-2 pt-2 sm:px-6 md:px-8 md:pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-[#F8FAFC]">Sua Biblioteca</h1>
            <p className="mt-2 text-sm text-[#94A3B8]">
              Playlists, curtidas e artistas que você segue — salvos localmente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-bold text-[#080B12] shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all hover:bg-cyan-300"
          >
            <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} />
            Nova Playlist
          </button>
        </div>
      </header>

      <div className="space-y-10 px-3 py-6 sm:px-6 md:px-8">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-cyan-400" strokeWidth={ICON_STROKE} />
            <h2 className="text-xl font-bold text-white">Playlists</h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {playlists.map((playlist) => (
              <Link
                key={playlist.id}
                to={`/playlist/${playlist.id}`}
                className="group rounded-xl border border-white/5 bg-white/5 p-3 transition-colors hover:border-cyan-400/30 hover:bg-white/10"
              >
                <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-[#111827]">
                  <img
                    src={playlist.coverUrl}
                    alt={playlist.name}
                    className="aspect-square h-full w-full rounded-xl object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <h3 className="truncate text-sm font-semibold text-white">
                  {playlist.name}
                </h3>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  {playlist.tracks.length}{' '}
                  {playlist.tracks.length === 1 ? 'faixa' : 'faixas'}
                </p>
              </Link>
            ))}

            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] text-gray-400 transition-all hover:border-cyan-400/60 hover:bg-cyan-500/5 hover:text-cyan-300"
            >
              <Plus className="h-8 w-8" strokeWidth={ICON_STROKE} />
              <span className="px-2 text-center text-sm font-medium">
                Criar nova playlist
              </span>
            </button>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <Heart className="h-5 w-5 text-cyan-400" strokeWidth={ICON_STROKE} />
            <h2 className="text-xl font-bold text-white">Curtidas</h2>
          </div>
          {likedTracks.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">Nenhuma música curtida.</p>
          ) : (
            <ul className="space-y-1">
              {likedTracks.map((track, index) => {
                const cover = track.album?.images?.[0]?.url
                const artistLabel =
                  track.artists.map((a) => a.name).join(', ') || 'Artista'

                return (
                  <li key={track.id}>
                    <button
                      type="button"
                      onClick={() => void playTrack(track, likedTracks)}
                      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
                    >
                      <span className="relative flex w-8 shrink-0 items-center justify-center sm:w-9">
                        <span className="text-center text-sm text-[#94A3B8] group-hover:hidden">
                          {index + 1}
                        </span>
                        <span className="absolute hidden items-center justify-center text-cyan-400 group-hover:flex">
                          <Play
                            className="h-4 w-4 translate-x-px"
                            strokeWidth={ICON_STROKE}
                            fill="currentColor"
                          />
                        </span>
                      </span>
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-md bg-[#111827]" />
                      )}
                      <div className="min-w-0 flex-1 truncate">
                        <p className="truncate text-sm font-medium text-white">
                          {track.name}
                        </p>
                        <p className="truncate text-xs text-[#94A3B8]">
                          {artistLabel}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums font-mono text-xs text-[#94A3B8]">
                        {Math.floor((track.duration_ms ?? 0) / 60000)}:
                        {String(
                          Math.floor(((track.duration_ms ?? 0) % 60000) / 1000),
                        ).padStart(2, '0')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-cyan-400" strokeWidth={ICON_STROKE} />
            <h2 className="text-xl font-bold text-white">Seguindo</h2>
          </div>
          {following.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">Nenhum artista seguido.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {following.map((artist) => (
                <button
                  key={artist.id}
                  type="button"
                  onClick={() =>
                    navigate(`/artist/${artist.id}`, {
                      state: { artistName: artist.name },
                    })
                  }
                  className="group flex flex-col items-center rounded-2xl border border-white/5 bg-[#111827]/70 p-4 text-center transition-all hover:border-cyan-400/40"
                >
                  {artist.imageUrl ? (
                    <img
                      src={artist.imageUrl}
                      alt={artist.name}
                      className="mb-3 h-24 w-24 rounded-full object-cover"
                    />
                  ) : (
                    <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-[#0B0F19]">
                      <User
                        className="h-8 w-8 text-[#94A3B8]"
                        strokeWidth={ICON_STROKE}
                      />
                    </div>
                  )}
                  <h3 className="w-full truncate text-sm font-bold text-white group-hover:text-cyan-400">
                    {artist.name}
                  </h3>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <CreatePlaylistModal
        open={isCreating}
        onClose={() => setIsCreating(false)}
        onCreated={() => {
          setPlaylists(getPlaylists())
        }}
      />
    </div>
  )
}
