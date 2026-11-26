import type { PlayerTrack } from '../store/usePlayerStore'

export const LIBRARY_STORAGE_KEY = 'azuri_user_playlists'
export const LIBRARY_UPDATED_EVENT = 'azuri-library-updated'
export const LIKED_TRACKS_KEY = 'azuri_liked_tracks'
export const FOLLOWING_ARTISTS_KEY = 'azuri_following_artists'
export const RECENT_PLAYS_KEY = 'azuri_recent_plays'

export type LibraryTrack = PlayerTrack

export type LikedTrackEntry = LibraryTrack & { likedAt: number }

export type FollowingArtist = {
  id: string
  name: string
  imageUrl?: string
}

export type RecentPlayItem =
  | {
      kind: 'track'
      id: string
      name: string
      imageUrl: string
      artists: LibraryTrack['artists']
      album?: LibraryTrack['album']
      duration_ms?: number
      at: number
    }
  | {
      kind: 'artist'
      id: string
      name: string
      imageUrl: string
      at: number
    }

export type UserPlaylist = {
  id: string
  name: string
  coverUrl: string
  tracks: LibraryTrack[]
}

const DEFAULT_PLAYLISTS: UserPlaylist[] = [
  {
    id: 'local-mix-neon',
    name: 'Mix Neon',
    coverUrl: 'https://picsum.photos/seed/lib-1/300/300',
    tracks: [],
  },
  {
    id: 'local-focus-flow',
    name: 'Focus Flow',
    coverUrl: 'https://picsum.photos/seed/lib-4/300/300',
    tracks: [],
  },
]

function emitLibraryUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LIBRARY_UPDATED_EVENT))
  }
}

function isValidPlaylist(value: unknown): value is UserPlaylist {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<UserPlaylist>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.coverUrl === 'string' &&
    Array.isArray(item.tracks)
  )
}

function normalizeTrack(track: LibraryTrack | Record<string, unknown>): LibraryTrack {
  const t = track as LibraryTrack
  return {
    id: String(t.id),
    name: String(t.name ?? 'Faixa'),
    artists: Array.isArray(t.artists)
      ? t.artists.map((artist, index) => ({
          id: artist?.id,
          name: artist?.name ?? `Artista ${index + 1}`,
        }))
      : [{ name: 'Artista desconhecido' }],
    album: t.album ?? null,
    duration_ms:
      typeof t.duration_ms === 'number'
        ? t.duration_ms
        : typeof (t as { durationMs?: number }).durationMs === 'number'
          ? (t as { durationMs: number }).durationMs
          : undefined,
  }
}

function readPlaylistsRaw(): UserPlaylist[] | null {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const playlists = parsed.filter(isValidPlaylist).map((playlist) => ({
      ...playlist,
      tracks: playlist.tracks.map((track) => normalizeTrack(track)),
    }))
    return playlists.length > 0 ? playlists : null
  } catch {
    return null
  }
}

function writePlaylists(playlists: UserPlaylist[]) {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(playlists))
  emitLibraryUpdated()
}

function ensureInitialized(): UserPlaylist[] {
  const existing = readPlaylistsRaw()
  if (existing) return existing
  writePlaylists(DEFAULT_PLAYLISTS)
  return DEFAULT_PLAYLISTS.map((playlist) => ({
    ...playlist,
    tracks: [...playlist.tracks],
  }))
}

export function getPlaylists(): UserPlaylist[] {
  return ensureInitialized().map((playlist) => ({
    ...playlist,
    tracks: [...playlist.tracks],
  }))
}

export function getPlaylistById(playlistId: string): UserPlaylist | null {
  return getPlaylists().find((playlist) => playlist.id === playlistId) ?? null
}

export type CreatePlaylistOptions = {
  coverUrl?: string
}

export const PLAYLIST_COVER_THEMES = [
  {
    id: 'cyan',
    label: 'Neon Cyan',
    coverUrl: 'https://picsum.photos/seed/azuri-theme-cyan/400/400',
  },
  {
    id: 'violet',
    label: 'Violet Pulse',
    coverUrl: 'https://picsum.photos/seed/azuri-theme-violet/400/400',
  },
  {
    id: 'ember',
    label: 'Ember Night',
    coverUrl: 'https://picsum.photos/seed/azuri-theme-ember/400/400',
  },
  {
    id: 'mint',
    label: 'Mint Wave',
    coverUrl: 'https://picsum.photos/seed/azuri-theme-mint/400/400',
  },
  {
    id: 'noir',
    label: 'Noir',
    coverUrl: 'https://picsum.photos/seed/azuri-theme-noir/400/400',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    coverUrl: 'https://picsum.photos/seed/azuri-theme-aurora/400/400',
  },
] as const

export function createPlaylist(
  name: string,
  options?: CreatePlaylistOptions,
): UserPlaylist {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Nome da playlist é obrigatório')
  }

  const playlists = ensureInitialized()
  const coverUrl =
    options?.coverUrl?.trim() ||
    `https://picsum.photos/seed/${encodeURIComponent(trimmed)}/300/300`

  const playlist: UserPlaylist = {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    coverUrl,
    tracks: [],
  }

  writePlaylists([playlist, ...playlists])
  return playlist
}

export function renamePlaylist(
  playlistId: string,
  name: string,
): UserPlaylist | null {
  const trimmed = name.trim()
  if (!trimmed) return null

  const playlists = ensureInitialized()
  const index = playlists.findIndex((playlist) => playlist.id === playlistId)
  if (index < 0) return null

  const nextPlaylist: UserPlaylist = {
    ...playlists[index],
    name: trimmed,
  }
  const next = [...playlists]
  next[index] = nextPlaylist
  writePlaylists(next)
  return { ...nextPlaylist, tracks: [...nextPlaylist.tracks] }
}

export function deletePlaylist(playlistId: string): boolean {
  const playlists = ensureInitialized()
  const next = playlists.filter((playlist) => playlist.id !== playlistId)
  if (next.length === playlists.length) return false
  writePlaylists(next)
  return true
}

export function addTrackToPlaylist(
  playlistId: string,
  track: LibraryTrack | Record<string, unknown>,
): boolean {
  const playlists = ensureInitialized()
  const index = playlists.findIndex((playlist) => playlist.id === playlistId)
  if (index < 0) return false

  const normalized = normalizeTrack(track)
  const playlist = playlists[index]
  if (playlist.tracks.some((item) => item.id === normalized.id)) {
    return false
  }

  const coverFromTrack = normalized.album?.images?.[0]?.url
  const nextPlaylist: UserPlaylist = {
    ...playlist,
    coverUrl: playlist.tracks.length === 0 && coverFromTrack
      ? coverFromTrack
      : playlist.coverUrl,
    tracks: [...playlist.tracks, normalized],
  }

  const next = [...playlists]
  next[index] = nextPlaylist
  writePlaylists(next)
  return true
}

export function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string,
): boolean {
  const playlists = ensureInitialized()
  const index = playlists.findIndex((playlist) => playlist.id === playlistId)
  if (index < 0) return false

  const playlist = playlists[index]
  const nextTracks = playlist.tracks.filter((track) => track.id !== trackId)
  if (nextTracks.length === playlist.tracks.length) return false

  const nextPlaylist: UserPlaylist = {
    ...playlist,
    tracks: nextTracks,
  }
  const next = [...playlists]
  next[index] = nextPlaylist
  writePlaylists(next)
  return true
}

function isLikedTrackEntry(value: unknown): value is LikedTrackEntry {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<LikedTrackEntry>
  return typeof item.id === 'string' && typeof item.name === 'string'
}

function readLikedTracksRaw(): LikedTrackEntry[] {
  try {
    const raw = localStorage.getItem(LIKED_TRACKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    // Compat: formato antigo era só string[]
    if (parsed.every((item) => typeof item === 'string')) {
      return (parsed as string[]).map((id, index) => ({
        id,
        name: 'Faixa curtida',
        artists: [{ name: 'Artista' }],
        album: null,
        likedAt: Date.now() - index,
      }))
    }

    return parsed
      .filter(isLikedTrackEntry)
      .map((item) => ({
        ...normalizeTrack(item),
        likedAt:
          typeof item.likedAt === 'number' ? item.likedAt : Date.now(),
      }))
  } catch {
    return []
  }
}

function writeLikedTracks(tracks: LikedTrackEntry[]) {
  localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(tracks))
  emitLibraryUpdated()
}

export function getLikedTracks(): LikedTrackEntry[] {
  return readLikedTracksRaw().sort((a, b) => b.likedAt - a.likedAt)
}

export function getRecentLikedTracks(limit = 4): LikedTrackEntry[] {
  return getLikedTracks().slice(0, Math.max(0, limit))
}

export function getLikedTrackIds(): string[] {
  return getLikedTracks().map((track) => track.id)
}

export function isTrackLiked(trackId: string): boolean {
  return getLikedTrackIds().includes(trackId)
}

export function toggleLikedTrack(
  trackOrId: string | LibraryTrack | Record<string, unknown>,
): boolean {
  const tracks = readLikedTracksRaw()
  const normalized =
    typeof trackOrId === 'string'
      ? ({ id: trackOrId, name: 'Faixa curtida', artists: [{ name: 'Artista' }] } as LibraryTrack)
      : normalizeTrack(trackOrId)

  const existingIndex = tracks.findIndex((item) => item.id === normalized.id)
  if (existingIndex >= 0) {
    const next = [...tracks]
    next.splice(existingIndex, 1)
    writeLikedTracks(next)
    return false
  }

  writeLikedTracks([{ ...normalized, likedAt: Date.now() }, ...tracks])
  return true
}

function readFollowingArtists(): FollowingArtist[] {
  try {
    const raw = localStorage.getItem(FOLLOWING_ARTISTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is FollowingArtist =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as FollowingArtist).id === 'string' &&
        typeof (item as FollowingArtist).name === 'string',
    )
  } catch {
    return []
  }
}

function writeFollowingArtists(artists: FollowingArtist[]) {
  localStorage.setItem(FOLLOWING_ARTISTS_KEY, JSON.stringify(artists))
  emitLibraryUpdated()
}

export function getFollowingArtists(): FollowingArtist[] {
  return readFollowingArtists().map((artist) => ({ ...artist }))
}

export function getFollowingArtistIds(): string[] {
  return getFollowingArtists().map((artist) => artist.id)
}

export function isFollowingArtist(artistId: string): boolean {
  return getFollowingArtistIds().includes(artistId)
}

export function toggleFollowArtist(artist: FollowingArtist): boolean {
  const artists = readFollowingArtists()
  const index = artists.findIndex((item) => item.id === artist.id)
  if (index >= 0) {
    const next = [...artists]
    next.splice(index, 1)
    writeFollowingArtists(next)
    return false
  }
  writeFollowingArtists([artist, ...artists])
  return true
}

function isRecentPlayItem(value: unknown): value is RecentPlayItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<RecentPlayItem>
  return (
    (item.kind === 'track' || item.kind === 'artist') &&
    typeof item.id === 'string' &&
    typeof item.name === 'string'
  )
}

export function getRecentPlays(limit = 12): RecentPlayItem[] {
  try {
    const raw = localStorage.getItem(RECENT_PLAYS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentPlayItem).slice(0, Math.max(0, limit))
  } catch {
    return []
  }
}

export function pushRecentPlay(item: Omit<RecentPlayItem, 'at'> & { at?: number }) {
  const entry = { ...item, at: item.at ?? Date.now() } as RecentPlayItem
  const existing = getRecentPlays(40).filter(
    (play) => !(play.kind === entry.kind && play.id === entry.id),
  )
  localStorage.setItem(
    RECENT_PLAYS_KEY,
    JSON.stringify([entry, ...existing].slice(0, 40)),
  )
  emitLibraryUpdated()
}

const LIBRARY_STORAGE_KEYS = new Set([
  LIBRARY_STORAGE_KEY,
  LIKED_TRACKS_KEY,
  FOLLOWING_ARTISTS_KEY,
  RECENT_PLAYS_KEY,
])

export function subscribeLibraryUpdates(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key && LIBRARY_STORAGE_KEYS.has(event.key)) {
      listener()
    }
  }

  window.addEventListener(LIBRARY_UPDATED_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(LIBRARY_UPDATED_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}
