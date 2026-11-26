import { MapPin, Play, User, X } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getUserReleases,
  incrementTrackPlays,
  subscribeReleasesUpdates,
  userTrackToPlayerTrack,
  type UserRelease,
} from '../services/creatorService'
import {
  getAccountIntentLabel,
  getProfileStats,
  getUserProfile,
  subscribeProfileUpdates,
  updateUserProfile,
  type UserProfile,
  type UserProfileStats,
} from '../services/userProfileService'
import { usePlayerStore, type PlayerTrack } from '../store/usePlayerStore'

const ICON_STROKE = 1.5

type ProfileTab =
  | 'overview'
  | 'releases'
  | 'playlists'
  | 'liked'
  | 'following'

const TABS: { id: ProfileTab; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'releases', label: 'Lançamentos' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'liked', label: 'Curtidas' },
  { id: 'following', label: 'Seguindo' },
]

export function Profile() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const playTrack = usePlayerStore((state) => state.playTrack)

  const [profile, setProfile] = useState<UserProfile>(() => getUserProfile())
  const [stats, setStats] = useState<UserProfileStats>(() => getProfileStats())
  const [releases, setReleases] = useState<UserRelease[]>(() => getUserReleases())
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    return subscribeProfileUpdates(() => {
      setProfile(getUserProfile())
      setStats(getProfileStats())
    })
  }, [])

  useEffect(() => {
    return subscribeReleasesUpdates(() => {
      setReleases(getUserReleases())
    })
  }, [])

  function playReleaseTrack(release: UserRelease, trackId: string) {
    const queue: PlayerTrack[] = release.tracks.map((track) =>
      userTrackToPlayerTrack(track, release),
    )
    const selected = queue.find((track) => track.id === trackId) ?? queue[0]
    if (!selected) return
    incrementTrackPlays(release.id, selected.id)
    void playTrack(selected, queue)
  }

  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setEditOpen(true)
    }
  }, [searchParams])

  function openEdit() {
    setEditOpen(true)
    setSearchParams({ edit: 'true' }, { replace: true })
  }

  function closeEdit() {
    setEditOpen(false)
    if (searchParams.get('edit')) {
      setSearchParams({}, { replace: true })
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#0B0F19] pb-32">
      <div className="relative h-72 w-full overflow-hidden bg-[#0B0F19] pt-2 md:h-80 md:pt-4">
        {profile.bannerUrl ? (
          <img
            src={profile.bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full scale-105 object-cover object-center opacity-70"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-[#0B0F19]/70 to-[#0B0F19]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F19] via-[#0B0F19]/50 to-black/30" />

        <div className="absolute bottom-0 z-10 flex w-full flex-col items-center gap-4 px-4 pb-4 text-center sm:flex-row sm:items-end sm:gap-6 sm:text-left md:gap-6 md:px-8 md:pb-6">
          <img
            src={profile.avatarUrl}
            alt={profile.name}
            className="h-32 w-32 shrink-0 rounded-full object-cover shadow-2xl ring-4 ring-[#0B0F19]"
          />

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="rounded-full border border-cyan-500/30 bg-[#111827]/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400 backdrop-blur-sm">
                {getAccountIntentLabel(profile.accountIntent)}
              </span>
            </div>

            <h1 className="mb-1 text-2xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
              {profile.name}
            </h1>
            <p className="mb-2 text-sm font-medium text-cyan-300/90">
              {profile.handle}
            </p>
            <p className="mb-4 flex items-center justify-center gap-1.5 text-sm text-[#94A3B8] sm:justify-start">
              <MapPin className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
              {profile.location}
            </p>

            <button
              type="button"
              onClick={openEdit}
              className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-white transition-colors hover:border-cyan-400 hover:text-cyan-300"
            >
              Editar Perfil
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-6 md:px-8 md:py-8">
        {profile.bio && (
          <p className="max-w-3xl text-sm leading-relaxed text-[#94A3B8]">
            {profile.bio}
          </p>
        )}

        {profile.favoriteGenres.length > 0 && (
          <div className="flex max-w-3xl flex-wrap gap-2">
            {profile.favoriteGenres.map((genre) => (
              <span
                key={genre}
                className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Playlists Públicas" value={stats.playlistsCount} />
          <StatCard label="Músicas Curtidas" value={stats.likedTracksCount} />
          <StatCard label="Seguindo" value={stats.followingCount} />
          <StatCard label="Seguidores" value={stats.followersCount} />
        </section>

        <div className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto border-b border-white/10 pb-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-400 font-bold text-[#0B0F19]'
                    : 'text-[#94A3B8] hover:bg-white/5 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {(activeTab === 'overview' || activeTab === 'releases') && (
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Lançamentos</h2>
              {activeTab === 'overview' && releases.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('releases')}
                  className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] hover:text-cyan-400"
                >
                  Ver todos
                </button>
              )}
            </div>

            {releases.length === 0 ? (
              activeTab === 'releases' ? (
                <EmptyState message="Nenhum lançamento publicado ainda. Use Upload no topo." />
              ) : null
            ) : (
              <div className="space-y-4">
                {(activeTab === 'overview' ? releases.slice(0, 3) : releases).map(
                  (release) => (
                    <article
                      key={release.id}
                      className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#111827] via-[#131C2E] to-cyan-950/20 p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row">
                        <img
                          src={release.coverUrl}
                          alt={release.title}
                          className="h-28 w-28 shrink-0 rounded-xl object-cover shadow-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-300">
                              {release.type}
                            </span>
                            <span className="text-xs text-[#94A3B8]">
                              {release.releaseDate}
                            </span>
                          </div>
                          <h3 className="truncate text-lg font-bold text-white">
                            {release.title}
                          </h3>
                          <p className="truncate text-sm text-[#94A3B8]">
                            {release.artistName}
                            {release.genre ? ` · ${release.genre}` : ''}
                          </p>

                          <ul className="mt-3 space-y-1">
                            {release.tracks.map((track) => (
                              <li key={track.id}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    playReleaseTrack(release, track.id)
                                  }
                                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                                >
                                  <span className="w-5 text-center text-xs text-[#94A3B8] group-hover:hidden">
                                    {track.trackNumber}
                                  </span>
                                  <span className="hidden w-5 items-center justify-center text-cyan-400 group-hover:flex">
                                    <Play
                                      className="h-3.5 w-3.5 translate-x-px"
                                      strokeWidth={ICON_STROKE}
                                      fill="currentColor"
                                    />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-white">
                                      {track.title}
                                      {track.featArtists
                                        ? ` (feat. ${track.featArtists})`
                                        : ''}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-xs tabular-nums text-[#94A3B8]">
                                    {track.durationMs > 0
                                      ? `${Math.floor(track.durationMs / 60000)}:${String(
                                          Math.floor((track.durationMs / 1000) % 60),
                                        ).padStart(2, '0')}`
                                      : '—'}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>
        )}

        {(activeTab === 'overview' || activeTab === 'playlists') && (
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Playlists</h2>
              {activeTab === 'overview' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('playlists')}
                  className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] hover:text-cyan-400"
                >
                  Ver todas
                </button>
              )}
            </div>

            {stats.playlists.length === 0 ? (
              <EmptyState message="Você ainda não criou playlists." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {(activeTab === 'overview'
                  ? stats.playlists.slice(0, 5)
                  : stats.playlists
                ).map((playlist) => (
                  <Link
                    key={playlist.id}
                    to={`/playlist/${playlist.id}`}
                    className="group rounded-xl border border-white/5 bg-white/5 p-3 transition-colors hover:border-cyan-400/30 hover:bg-white/10"
                  >
                    <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-[#111827]">
                      <img
                        src={playlist.coverUrl}
                        alt={playlist.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
              </div>
            )}
          </section>
        )}

        {(activeTab === 'overview' || activeTab === 'liked') && (
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Curtidas</h2>
              {activeTab === 'overview' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('liked')}
                  className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] hover:text-cyan-400"
                >
                  Ver todas
                </button>
              )}
            </div>

            {stats.likedTracks.length === 0 ? (
              <EmptyState message="Nenhuma música curtida ainda." />
            ) : (
              <ul className="space-y-1">
                {(activeTab === 'overview'
                  ? stats.likedTracks.slice(0, 5)
                  : stats.likedTracks
                ).map((track, index) => {
                  const cover = track.album?.images?.[0]?.url
                  const artistLabel =
                    track.artists.map((a) => a.name).join(', ') || 'Artista'

                  return (
                    <li key={track.id}>
                      <button
                        type="button"
                        onClick={() =>
                          void playTrack(
                            track,
                            activeTab === 'overview'
                              ? stats.likedTracks.slice(0, 5)
                              : stats.likedTracks,
                          )
                        }
                        className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="w-6 text-center text-sm text-[#94A3B8] group-hover:hidden">
                          {index + 1}
                        </span>
                        <span className="hidden w-6 items-center justify-center text-cyan-400 group-hover:flex">
                          <Play
                            className="h-4 w-4 translate-x-px"
                            strokeWidth={ICON_STROKE}
                            fill="currentColor"
                          />
                        </span>
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-[#111827]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">
                            {track.name}
                          </p>
                          <p className="truncate text-xs text-[#94A3B8]">
                            {artistLabel}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {(activeTab === 'overview' || activeTab === 'following') && (
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Seguindo</h2>
              {activeTab === 'overview' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('following')}
                  className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8] hover:text-cyan-400"
                >
                  Ver todos
                </button>
              )}
            </div>

            {stats.following.length === 0 ? (
              <EmptyState message="Você ainda não segue nenhum artista." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {(activeTab === 'overview'
                  ? stats.following.slice(0, 5)
                  : stats.following
                ).map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() =>
                      navigate(`/artist/${artist.id}`, {
                        state: { artistName: artist.name },
                      })
                    }
                    className="group flex flex-col items-center rounded-2xl border border-white/5 bg-[#111827]/70 p-4 text-center transition-all hover:border-cyan-400/40 hover:bg-[#1E293B]/90"
                  >
                    {artist.imageUrl ? (
                      <img
                        src={artist.imageUrl}
                        alt={artist.name}
                        className="mb-3 h-24 w-24 rounded-full object-cover shadow-xl transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-[#0B0F19] shadow-xl">
                        <User
                          className="h-8 w-8 text-[#94A3B8]"
                          strokeWidth={ICON_STROKE}
                        />
                      </div>
                    )}
                    <h3 className="w-full truncate text-sm font-bold text-white group-hover:text-cyan-400">
                      {artist.name}
                    </h3>
                    <span className="mt-1 text-[10px] uppercase tracking-wide text-cyan-400/80">
                      Artista
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <EditProfileModal
        open={editOpen}
        profile={profile}
        onClose={closeEdit}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 backdrop-blur-sm">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-[#94A3B8]">
        {label}
      </p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-[#94A3B8]">
      {message}
    </p>
  )
}

function EditProfileModal({
  open,
  profile,
  onClose,
}: {
  open: boolean
  profile: UserProfile
  onClose: () => void
}) {
  const titleId = useId()
  const [name, setName] = useState(profile.name)
  const [handle, setHandle] = useState(profile.handle)
  const [bio, setBio] = useState(profile.bio)
  const [location, setLocation] = useState(profile.location)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl)

  useEffect(() => {
    if (!open) return
    setName(profile.name)
    setHandle(profile.handle)
    setBio(profile.bio)
    setLocation(profile.location)
    setAvatarUrl(profile.avatarUrl)
  }, [open, profile])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    updateUserProfile({ name, handle, bio, location, avatarUrl })
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111827] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-white">
            Editar Perfil
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-[#94A3B8] transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Nome"
            value={name}
            onChange={setName}
            placeholder="Seu nome"
          />
          <Field
            label="@handle"
            value={handle}
            onChange={setHandle}
            placeholder="@seuhandle"
          />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#94A3B8]">
              Bio
            </span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-400/50"
              placeholder="Conte um pouco sobre seus gostos musicais"
            />
          </label>
          <Field
            label="Localização"
            value={location}
            onChange={setLocation}
            placeholder="Cidade, País"
          />
          <Field
            label="Link do Avatar"
            value={avatarUrl}
            onChange={setAvatarUrl}
            placeholder="https://..."
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm text-[#94A3B8] transition-colors hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-bold text-[#0B0F19] transition-transform hover:scale-[1.02]"
            >
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#94A3B8]">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-[#0B0F19] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-cyan-400/50"
      />
    </label>
  )
}
