import {
  AtSign,
  Camera,
  Check,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  MapPin,
  Play,
  Shuffle,
  Upload,
  User,
  UserCog,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getUserReleases,
  incrementTrackPlays,
  subscribeReleasesUpdates,
  userTrackToPlayerTrack,
  type UserRelease,
} from '../services/creatorService'
import { useAuth } from '../contexts/AuthContext'
import { getAppwriteErrorMessage } from '../lib/appwrite'
import {
  getAccountIntentLabel,
  getProfileStats,
  getUserProfile,
  subscribeProfileUpdates,
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
  const { profile: authProfile } = useAuth()

  const [profile, setProfile] = useState<UserProfile>(
    () => authProfile ?? getUserProfile(),
  )
  const [stats, setStats] = useState<UserProfileStats>(() => getProfileStats())
  const [releases, setReleases] = useState<UserRelease[]>(() => getUserReleases())
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    setProfile(authProfile)
  }, [authProfile])

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
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#070d14] pb-32">
      <div className="relative h-72 w-full overflow-hidden bg-[#070d14] pt-2 md:h-80 md:pt-4">
        {profile.bannerUrl ? (
          <img
            src={profile.bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full scale-105 object-cover object-center"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/15 via-[#070d14]/55 to-[#070d14]/90" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070d14] via-[#070d14]/45 to-black/20" />

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

const BIO_MAX = 160
const INPUT_FIELD_CLASS =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition-all focus:border-cyan-400/60 focus:bg-cyan-950/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/15'

function getProfileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
}

function formatHandleInput(raw: string): string {
  const cleaned = raw.replace(/^@+/, '').replace(/\s/g, '')
  return cleaned ? `@${cleaned}` : ''
}

function generateRandomAvatarUrl(): string {
  const seed = `azuri-${Math.random().toString(36).slice(2, 10)}`
  return `https://picsum.photos/seed/${seed}/256/256`
}

function generateRandomBannerUrl(): string {
  const seed = `azuri-banner-${Math.random().toString(36).slice(2, 10)}`
  return `https://picsum.photos/seed/${seed}/1200/400`
}

function isDataImage(url: string): boolean {
  return url.trim().startsWith('data:image/')
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao carregar imagem'))
    img.src = src
  })
}

/** Recorte central 320×320 + compressão WebP/JPEG para caber no localStorage. */
async function compressAvatarImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    const size = 320
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas não suportado')

    const minSide = Math.min(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
    )
    if (!(minSide > 0)) throw new Error('Imagem inválida')

    const sx = ((img.naturalWidth || img.width) - minSide) / 2
    const sy = ((img.naturalHeight || img.height) - minSide) / 2
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size)

    const webp = canvas.toDataURL('image/webp', 0.85)
    if (webp.startsWith('data:image/webp')) return webp
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], filename, {
    type: blob.type || 'image/jpeg',
  })
}

/** Recorte panorâmico 3:1 (1200×400) + compressão WebP/JPEG. */
async function compressBannerImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(objectUrl)
    const outW = 1200
    const outH = 400
    const srcW = img.naturalWidth || img.width
    const srcH = img.naturalHeight || img.height
    if (!(srcW > 0 && srcH > 0)) throw new Error('Imagem inválida')

    const targetRatio = outW / outH
    const srcRatio = srcW / srcH
    let sx = 0
    let sy = 0
    let sw = srcW
    let sh = srcH

    if (srcRatio > targetRatio) {
      sw = srcH * targetRatio
      sx = (srcW - sw) / 2
    } else {
      sh = srcW / targetRatio
      sy = (srcH - sh) / 2
    }

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas não suportado')
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)

    const webp = canvas.toDataURL('image/webp', 0.82)
    if (webp.startsWith('data:image/webp')) return webp
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
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
  const { updateProfile } = useAuth()
  const avatarFileRef = useRef<HTMLInputElement | null>(null)
  const bannerFileRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState(profile.name)
  const [handle, setHandle] = useState(profile.handle)
  const [bio, setBio] = useState(profile.bio)
  const [location, setLocation] = useState(profile.location)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl)
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl)
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [bannerBroken, setBannerBroken] = useState(false)
  const [compressingAvatar, setCompressingAvatar] = useState(false)
  const [compressingBanner, setCompressingBanner] = useState(false)
  const [avatarDirty, setAvatarDirty] = useState(false)
  const [bannerDirty, setBannerDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(profile.name)
    setHandle(profile.handle)
    setBio(profile.bio)
    setLocation(profile.location)
    setAvatarUrl(profile.avatarUrl)
    setBannerUrl(profile.bannerUrl)
    setAvatarBroken(false)
    setBannerBroken(false)
    setCompressingAvatar(false)
    setCompressingBanner(false)
    setAvatarDirty(false)
    setBannerDirty(false)
    setSaving(false)
    setSaveError('')
  }, [open, profile])

  useEffect(() => {
    setAvatarBroken(false)
  }, [avatarUrl])

  useEffect(() => {
    setBannerBroken(false)
  }, [bannerUrl])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const previewHandle = formatHandleInput(handle) || '@handle'
  const showAvatarImage = Boolean(avatarUrl.trim()) && !avatarBroken
  const showBannerImage = Boolean(bannerUrl.trim()) && !bannerBroken
  const bioLength = bio.length
  const dataAvatar = isDataImage(avatarUrl)
  const dataBanner = isDataImage(bannerUrl)
  const busy = compressingAvatar || compressingBanner || saving

  function openAvatarPicker() {
    avatarFileRef.current?.click()
  }

  function openBannerPicker() {
    bannerFileRef.current?.click()
  }

  async function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return

    setCompressingAvatar(true)
    try {
      const dataUrl = await compressAvatarImage(file)
      setAvatarUrl(dataUrl)
      setAvatarDirty(true)
      setAvatarBroken(false)
    } catch (error) {
      console.error('Falha ao comprimir avatar:', error)
    } finally {
      setCompressingAvatar(false)
    }
  }

  async function handleBannerFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return

    setCompressingBanner(true)
    try {
      const dataUrl = await compressBannerImage(file)
      setBannerUrl(dataUrl)
      setBannerDirty(true)
      setBannerBroken(false)
    } catch (error) {
      console.error('Falha ao comprimir capa:', error)
    } finally {
      setCompressingBanner(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const avatarFile =
        avatarDirty && isDataImage(avatarUrl)
          ? await dataUrlToFile(avatarUrl, `avatar-${Date.now()}.webp`)
          : null
      const bannerFile =
        bannerDirty && isDataImage(bannerUrl)
          ? await dataUrlToFile(bannerUrl, `banner-${Date.now()}.webp`)
          : null

      await updateProfile({
        name,
        handle: formatHandleInput(handle),
        bio: bio.slice(0, BIO_MAX),
        location,
        avatarUrl: avatarDirty ? undefined : avatarUrl,
        bannerUrl: bannerDirty ? undefined : bannerUrl,
        avatarFile,
        bannerFile,
      })
      onClose()
    } catch (error) {
      setSaveError(
        getAppwriteErrorMessage(
          error,
          'Não foi possível salvar o perfil. Tente novamente.',
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[min(92vh,780px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-cyan-400/20 bg-[#0a111a]/95 shadow-[0_24px_70px_rgba(0,0,0,0.75),0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-2xl"
      >
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => void handleAvatarFileChange(event)}
        />
        <input
          ref={bannerFileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void handleBannerFileChange(event)}
        />

        {/* Cabeçalho */}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 pb-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-400">
              <UserCog className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-lg font-bold tracking-tight text-slate-50"
              >
                Editar Perfil
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Personalize como você aparece no Azuri Music
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="cursor-pointer rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" strokeWidth={ICON_STROKE} />
          </button>
        </div>

        {/* Mini-banner ao vivo */}
        <div className="shrink-0 px-6 pb-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/10">
            {showBannerImage ? (
              <img
                src={bannerUrl.trim()}
                alt=""
                onError={() => setBannerBroken(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-[#0a111a] to-[#111827]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0a111a]/95 via-[#0a111a]/70 to-[#0a111a]/40" />

            <button
              type="button"
              onClick={openBannerPicker}
              disabled={busy}
              className="absolute top-2.5 right-2.5 z-10 inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-slate-100 backdrop-blur-md transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-60"
            >
              <Camera className="h-3 w-3 text-cyan-300" strokeWidth={ICON_STROKE} />
              Alterar capa
            </button>

            <div className="relative z-10 flex items-center gap-4 p-3.5">
              <button
                type="button"
                onClick={openAvatarPicker}
                disabled={busy}
                aria-label="Alterar foto de perfil"
                className="group relative h-16 w-16 shrink-0 cursor-pointer overflow-hidden rounded-full shadow-[0_0_20px_rgba(34,211,238,0.25)] ring-2 ring-cyan-400/50 disabled:cursor-wait"
              >
                {showAvatarImage ? (
                  <img
                    src={avatarUrl.trim()}
                    alt=""
                    onError={() => setAvatarBroken(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-cyan-400/15 text-lg font-bold text-cyan-300">
                    {getProfileInitials(name || profile.name)}
                  </div>
                )}
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera
                    className="h-4 w-4 text-cyan-300"
                    strokeWidth={ICON_STROKE}
                  />
                  <span className="text-[10px] font-medium text-cyan-100">
                    {compressingAvatar ? '…' : 'Alterar'}
                  </span>
                </span>
              </button>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-50">
                  {name.trim() || 'Seu nome'}
                </p>
                <p className="truncate text-xs text-cyan-400">{previewHandle}</p>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="max-h-[75vh] min-h-0 flex-1 space-y-3.5 overflow-y-auto px-6 pb-4">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <IconField
                label="Nome"
                icon={User}
                value={name}
                onChange={setName}
                placeholder="Seu nome"
              />
              <IconField
                label="@Handle"
                icon={AtSign}
                value={handle}
                onChange={(value) => setHandle(formatHandleInput(value))}
                placeholder="@seuhandle"
              />
            </div>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-slate-400">
                <span>Bio</span>
                <span className="tabular-nums text-slate-500">
                  {bioLength} / {BIO_MAX}
                </span>
              </span>
              <div className="group relative">
                <FileText
                  className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-cyan-400"
                  strokeWidth={ICON_STROKE}
                />
                <textarea
                  value={bio}
                  onChange={(event) =>
                    setBio(event.target.value.slice(0, BIO_MAX))
                  }
                  rows={3}
                  maxLength={BIO_MAX}
                  placeholder="Conte um pouco sobre seus gostos musicais"
                  className={`${INPUT_FIELD_CLASS} resize-none`}
                />
              </div>
            </label>

            <IconField
              label="Localização"
              icon={MapPin}
              value={location}
              onChange={setLocation}
              placeholder="São Paulo, Brasil"
            />

            <div className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Avatar
              </span>
              <div className="flex flex-col gap-2">
                {dataAvatar ? (
                  <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-2.5">
                    <ImageIcon
                      className="h-4 w-4 shrink-0 text-cyan-400"
                      strokeWidth={ICON_STROKE}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-cyan-100/90">
                      Foto carregada do dispositivo
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarUrl('')
                        setAvatarDirty(false)
                      }}
                      aria-label="Remover foto local"
                      title="Limpar e usar URL"
                      className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                    </button>
                  </div>
                ) : (
                  <div className="group relative">
                    <ImageIcon
                      className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-cyan-400"
                      strokeWidth={ICON_STROKE}
                    />
                    <input
                      type="url"
                      value={avatarUrl}
                      onChange={(event) => {
                        setAvatarUrl(event.target.value)
                        setAvatarDirty(false)
                      }}
                      placeholder="https://..."
                      className={INPUT_FIELD_CLASS}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openAvatarPicker}
                    disabled={busy}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-400/20 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                    {compressingAvatar ? 'Processando…' : 'Enviar foto'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl(generateRandomAvatarUrl())
                      setAvatarDirty(false)
                    }}
                    disabled={busy}
                    title="Gerar avatar"
                    aria-label="Gerar avatar aleatório"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-400/20 hover:text-cyan-200 disabled:opacity-60"
                  >
                    <Shuffle className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                    Gerar
                  </button>
                </div>
              </div>
            </div>

            <div className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <ImagePlus
                  className="h-3.5 w-3.5 text-cyan-400/80"
                  strokeWidth={ICON_STROKE}
                />
                Foto de Capa
              </span>
              <div className="flex flex-col gap-2">
                {dataBanner ? (
                  <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3.5 py-2.5">
                    <ImagePlus
                      className="h-4 w-4 shrink-0 text-cyan-400"
                      strokeWidth={ICON_STROKE}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-cyan-100/90">
                      Capa carregada do dispositivo
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBannerUrl('')
                        setBannerDirty(false)
                      }}
                      aria-label="Remover capa local"
                      title="Limpar e usar URL"
                      className="cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                    </button>
                  </div>
                ) : (
                  <div className="group relative">
                    <ImagePlus
                      className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-cyan-400"
                      strokeWidth={ICON_STROKE}
                    />
                    <input
                      type="url"
                      value={bannerUrl}
                      onChange={(event) => {
                        setBannerUrl(event.target.value)
                        setBannerDirty(false)
                      }}
                      placeholder="https://..."
                      className={INPUT_FIELD_CLASS}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openBannerPicker}
                    disabled={busy}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-400/20 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                    {compressingBanner ? 'Processando…' : 'Enviar capa'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBannerUrl(generateRandomBannerUrl())
                      setBannerDirty(false)
                    }}
                    disabled={busy}
                    title="Gerar capa"
                    aria-label="Gerar capa aleatória"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 py-2.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-400/50 hover:bg-cyan-400/20 hover:text-cyan-200 disabled:opacity-60"
                  >
                    <Shuffle className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                    Gerar
                  </button>
                </div>
              </div>
            </div>

            {saveError ? (
              <p className="text-xs text-rose-400">{saveError}</p>
            ) : null}
          </div>

          {/* Rodapé */}
          <div className="mt-2 flex shrink-0 items-center justify-end gap-3 border-t border-white/10 bg-white/[0.02] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.35)] transition-all hover:bg-cyan-300 active:scale-95 disabled:cursor-wait disabled:opacity-60"
            >
              <Check className="h-4 w-4" strokeWidth={ICON_STROKE} />
              {saving ? 'Salvando…' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

function IconField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
}: {
  label: string
  icon: LucideIcon
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">
        {label}
      </span>
      <div className="group relative">
        <Icon
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-cyan-400"
          strokeWidth={ICON_STROKE}
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={INPUT_FIELD_CLASS}
        />
      </div>
    </label>
  )
}
