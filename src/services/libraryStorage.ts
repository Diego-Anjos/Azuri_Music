import type { PlayerTrack } from '../store/usePlayerStore'

export const LIBRARY_STORAGE_KEY = 'azuri_user_playlists'
export const LIBRARY_UPDATED_EVENT = 'azuri-library-updated'
export const LIKED_TRACKS_KEY = 'azuri_liked_tracks'

export type LibraryTrack = PlayerTrack

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

export function createPlaylist(name: string): UserPlaylist {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Nome da playlist é obrigatório')
  }

  const playlists = ensureInitialized()
  const playlist: UserPlaylist = {
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    coverUrl: `https://picsum.photos/seed/${encodeURIComponent(trimmed)}/300/300`,
    tracks: [],
  }

  writePlaylists([playlist, ...playlists])
  return playlist
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

export function getLikedTrackIds(): string[] {
  try {
    const raw = localStorage.getItem(LIKED_TRACKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

export function isTrackLiked(trackId: string): boolean {
  return getLikedTrackIds().includes(trackId)
}

export function toggleLikedTrack(trackId: string): boolean {
  const liked = new Set(getLikedTrackIds())
  if (liked.has(trackId)) liked.delete(trackId)
  else liked.add(trackId)
  localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify([...liked]))
  emitLibraryUpdated()
  return liked.has(trackId)
}

export function subscribeLibraryUpdates(listener: () => void): () => void {
  window.addEventListener(LIBRARY_UPDATED_EVENT, listener)
  return () => window.removeEventListener(LIBRARY_UPDATED_EVENT, listener)
}
