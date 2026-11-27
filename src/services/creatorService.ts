export const USER_RELEASES_KEY = 'azuri_user_releases'
export const RELEASES_UPDATED_EVENT = 'azuri-releases-updated'

export type ReleaseType = 'single' | 'ep' | 'album'
export type ReleaseVisibility = 'public' | 'private'

export type UserTrack = {
  id: string
  trackNumber: number
  title: string
  featArtists: string
  audioUrl: string
  durationMs: number
  lyrics: string
  plays: number
  /** Link opcional do videoclipe oficial (YouTube). */
  videoUrl?: string
}

export type UserRelease = {
  id: string
  type: ReleaseType
  title: string
  artistName: string
  artistHandle: string
  coverUrl: string
  genre: string
  tags: string[]
  description: string
  releaseDate: string
  visibility: ReleaseVisibility
  tracks: UserTrack[]
}

export type PreparedAudio = {
  objectUrl: string
  durationMs: number
  fileName: string
  mimeType: string
}

function emitReleasesUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(RELEASES_UPDATED_EVENT))
  }
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isUserTrack(value: unknown): value is UserTrack {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<UserTrack>
  return (
    typeof item.id === 'string' &&
    typeof item.trackNumber === 'number' &&
    typeof item.title === 'string' &&
    typeof item.audioUrl === 'string'
  )
}

function isUserRelease(value: unknown): value is UserRelease {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<UserRelease>
  return (
    typeof item.id === 'string' &&
    (item.type === 'single' || item.type === 'ep' || item.type === 'album') &&
    typeof item.title === 'string' &&
    Array.isArray(item.tracks)
  )
}

function normalizeTrack(track: UserTrack, index: number): UserTrack {
  return {
    id: track.id || createId('track'),
    trackNumber: track.trackNumber || index + 1,
    title: track.title?.trim() || `Faixa ${index + 1}`,
    featArtists: track.featArtists?.trim() || '',
    audioUrl: track.audioUrl,
    durationMs:
      typeof track.durationMs === 'number' && Number.isFinite(track.durationMs)
        ? Math.max(0, Math.round(track.durationMs))
        : 0,
    lyrics: track.lyrics?.trim() || '',
    plays: typeof track.plays === 'number' ? track.plays : 0,
    videoUrl: track.videoUrl?.trim() || undefined,
  }
}

function normalizeRelease(release: UserRelease): UserRelease {
  return {
    id: release.id || createId('release'),
    type: release.type,
    title: release.title.trim(),
    artistName: release.artistName.trim(),
    artistHandle: release.artistHandle.trim(),
    coverUrl: release.coverUrl.trim(),
    genre: release.genre.trim(),
    tags: (release.tags ?? [])
      .map((tag) => tag.trim())
      .filter(Boolean),
    description: release.description?.trim() || '',
    releaseDate: release.releaseDate || new Date().toISOString().slice(0, 10),
    visibility: release.visibility === 'private' ? 'private' : 'public',
    tracks: (release.tracks ?? [])
      .filter(isUserTrack)
      .map((track, index) => normalizeTrack(track, index)),
  }
}

function readReleasesRaw(): UserRelease[] {
  try {
    const raw = localStorage.getItem(USER_RELEASES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isUserRelease).map(normalizeRelease)
  } catch {
    return []
  }
}

function writeReleases(releases: UserRelease[]) {
  localStorage.setItem(USER_RELEASES_KEY, JSON.stringify(releases))
  emitReleasesUpdated()
}

export function getUserReleases(): UserRelease[] {
  return readReleasesRaw()
}

export function getUserReleaseById(id: string): UserRelease | null {
  return getUserReleases().find((release) => release.id === id) ?? null
}

export function saveUserRelease(
  input: Omit<UserRelease, 'id'> & { id?: string },
): UserRelease {
  const releases = readReleasesRaw()
  const normalized = normalizeRelease({
    ...input,
    id: input.id || createId('release'),
  } as UserRelease)

  const index = releases.findIndex((item) => item.id === normalized.id)
  const next =
    index >= 0
      ? releases.map((item, i) => (i === index ? normalized : item))
      : [normalized, ...releases]

  writeReleases(next)
  return normalized
}

export function deleteUserRelease(id: string): boolean {
  const releases = readReleasesRaw()
  const next = releases.filter((release) => release.id !== id)
  if (next.length === releases.length) return false
  writeReleases(next)
  return true
}

export function incrementTrackPlays(releaseId: string, trackId: string): void {
  const releases = readReleasesRaw()
  const next = releases.map((release) => {
    if (release.id !== releaseId) return release
    return {
      ...release,
      tracks: release.tracks.map((track) =>
        track.id === trackId ? { ...track, plays: track.plays + 1 } : track,
      ),
    }
  })
  writeReleases(next)
}

/**
 * Lê um ficheiro de áudio, extrai a duração via Audio(objectUrl).loadedmetadata
 * e devolve um objectUrl pronto para o player.
 */
export function prepareAudioFile(file: File): Promise<PreparedAudio> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
      reject(new Error('Ficheiro de áudio inválido'))
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'

    const cleanup = () => {
      audio.removeAttribute('src')
      audio.load()
    }

    audio.addEventListener(
      'loadedmetadata',
      () => {
        const durationSec = Number.isFinite(audio.duration) ? audio.duration : 0
        const durationMs = Math.max(0, Math.round(durationSec * 1000))
        cleanup()
        resolve({
          objectUrl,
          durationMs,
          fileName: file.name,
          mimeType: file.type || 'audio/mpeg',
        })
      },
      { once: true },
    )

    audio.addEventListener(
      'error',
      () => {
        cleanup()
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Não foi possível ler a duração do áudio'))
      },
      { once: true },
    )

    audio.src = objectUrl
  })
}

/** Converte File em data URL para persistir capa/áudio no localStorage (mock pré-DB). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Falha ao converter ficheiro'))
    }
    reader.onerror = () => reject(new Error('Falha ao ler ficheiro'))
    reader.readAsDataURL(file)
  })
}

export function subscribeReleasesUpdates(listener: () => void): () => void {
  window.addEventListener(RELEASES_UPDATED_EVENT, listener)
  return () => window.removeEventListener(RELEASES_UPDATED_EVENT, listener)
}

/** Converte faixa de lançamento do Studio para o formato do player global. */
export function userTrackToPlayerTrack(
  track: UserTrack,
  release: UserRelease,
): {
  id: string
  name: string
  artists: Array<{ id?: string; name: string }>
  album?: {
    id?: string
    name?: string
    release_date?: string
    images?: Array<{ url: string }> | null
  } | null
  duration_ms?: number
  audioUrl?: string
  videoUrl?: string
} {
  const artists = [{ name: release.artistName }]
  if (track.featArtists.trim()) {
    for (const feat of track.featArtists.split(',').map((item) => item.trim()).filter(Boolean)) {
      artists.push({ name: feat })
    }
  }

  return {
    id: track.id,
    name: track.title,
    artists,
    duration_ms: track.durationMs,
    audioUrl: track.audioUrl,
    videoUrl: track.videoUrl,
    album: {
      id: release.id,
      name: release.title,
      release_date: release.releaseDate,
      images: release.coverUrl ? [{ url: release.coverUrl }] : null,
    },
  }
}
