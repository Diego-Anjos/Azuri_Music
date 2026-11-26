import { create } from 'zustand'
import {
  buildStreamProxyUrl,
  getAudioSettings,
  isStreamProxyUrl,
} from '../services/audioSettingsService'
import { pushRecentPlay } from '../services/libraryStorage'
import { recordTrackPlay } from '../services/recommendationService'
import { searchTracksByQuery } from '../services/spotify'

const RESOLVE_URL = 'http://localhost:3001/api/stream/resolve'
const STREAM_BASE = 'http://localhost:3001/api/stream'

export interface PlayerTrack {
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
  /** URL direta de áudio (upload local / data URL / CDN futuro). */
  audioUrl?: string
}

interface PlayerState {
  currentTrack: PlayerTrack | null
  youtubeVideoId: string | null
  localAudioUrl: string | null
  /** MediaElementSource conectado sem bloqueio CORS. */
  isEqActive: boolean
  isPlaying: boolean
  volume: number
  progress: number
  duration: number
  /** Fração 0–1 pedida ao ReactPlayer/audio; consumida e limpa pelo MusicPlayer. */
  seekRequest: number | null
  queue: PlayerTrack[]
  isLyricsOpen: boolean
  playTrack: (track: PlayerTrack, newQueue?: PlayerTrack[]) => Promise<void>
  addToQueue: (track: PlayerTrack) => void
  playNext: (track: PlayerTrack) => Promise<void>
  startTrackStation: (track: PlayerTrack) => Promise<void>
  togglePlay: () => void
  setVolume: (value: number) => void
  setProgress: (value: number) => void
  setDuration: (value: number) => void
  seekTo: (fraction: number) => void
  clearSeekRequest: () => void
  handleNextTrack: () => Promise<void>
  toggleLyrics: () => void
  closeLyrics: () => void
  setEqActive: (active: boolean) => void
  /** Fallback para iframe YouTube quando o proxy CORS falha. */
  fallbackToYoutube: () => Promise<void>
  /** Recarrega URL do proxy quando a qualidade muda. */
  refreshStreamQuality: () => void
}

function toPlayerTrackFromSearch(track: {
  id: string
  name: string
  artists: Array<{ id: string; name: string }>
  albumCoverUrl: string
  albumName?: string
  albumReleaseDate?: string
  durationMs: number
}): PlayerTrack {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists,
    duration_ms: track.durationMs,
    album: {
      name: track.albumName,
      release_date: track.albumReleaseDate,
      images: track.albumCoverUrl ? [{ url: track.albumCoverUrl }] : null,
    },
  }
}

function buildTrackQuery(track: PlayerTrack): string {
  const artistName = track.artists?.[0]?.name ?? ''
  return `${track.name} ${artistName}`.trim()
}

async function resolveYoutubeVideoId(track: PlayerTrack): Promise<string | null> {
  const query = buildTrackQuery(track)
  const quality = getAudioSettings().quality

  try {
    const response = await fetch(
      `${RESOLVE_URL}?query=${encodeURIComponent(query)}&quality=${encodeURIComponent(quality)}`,
      { headers: { Accept: 'application/json' } },
    )

    if (!response.ok) {
      // Compat: tenta rota legada com resolve=1
      const legacy = await fetch(
        `${STREAM_BASE}?query=${encodeURIComponent(query)}&quality=${encodeURIComponent(quality)}&resolve=1`,
        { headers: { Accept: 'application/json' } },
      )
      if (!legacy.ok) {
        console.error('Falha ao resolver vídeo:', response.status)
        return null
      }
      const legacyData = (await legacy.json()) as { videoId?: string }
      return legacyData.videoId ?? null
    }

    const data = (await response.json()) as {
      videoId?: string
      title?: string
    }

    if (!data.videoId) {
      console.error('Resposta sem videoId')
      return null
    }

    return data.videoId
  } catch (error) {
    console.error('Erro ao resolver vídeo no YouTube:', error)
    return null
  }
}

async function startPlayback(track: PlayerTrack): Promise<void> {
  // Uploads locais / data URLs / blob — Web Audio direto
  if (track.audioUrl) {
    const url = track.audioUrl
    const needsProxy =
      /^https?:\/\//i.test(url) &&
      !url.startsWith('http://localhost:3001/') &&
      !url.startsWith(window.location.origin)

    usePlayerStore.setState({
      localAudioUrl: needsProxy
        ? buildStreamProxyUrl(buildTrackQuery(track))
        : url,
      youtubeVideoId: null,
      isEqActive: false,
      isPlaying: true,
      duration: track.duration_ms ? track.duration_ms / 1000 : 0,
    })
    return
  }

  // Streams externos via proxy CORS → permite EQ / Web Audio
  const proxyUrl = buildStreamProxyUrl(buildTrackQuery(track))
  usePlayerStore.setState({
    localAudioUrl: proxyUrl,
    youtubeVideoId: null,
    isEqActive: false,
    isPlaying: true,
  })
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  youtubeVideoId: null,
  localAudioUrl: null,
  isEqActive: false,
  isPlaying: false,
  volume: 0.5,
  progress: 0,
  duration: 0,
  seekRequest: null,
  queue: [],
  isLyricsOpen: false,
  setEqActive: (active) => set({ isEqActive: active }),
  refreshStreamQuality: () => {
    const { localAudioUrl, currentTrack } = get()
    if (!currentTrack || !isStreamProxyUrl(localAudioUrl)) return
    const nextUrl = buildStreamProxyUrl(buildTrackQuery(currentTrack))
    if (nextUrl === localAudioUrl) return
    set({
      localAudioUrl: nextUrl,
      progress: 0,
      isEqActive: false,
    })
  },
  fallbackToYoutube: async () => {
    const { currentTrack } = get()
    if (!currentTrack || currentTrack.audioUrl) return

    const videoId = await resolveYoutubeVideoId(currentTrack)
    if (!videoId) {
      set({ isPlaying: false, isEqActive: false })
      return
    }

    set({
      youtubeVideoId: videoId,
      localAudioUrl: null,
      isEqActive: false,
      isPlaying: true,
    })
  },
  playTrack: async (track, newQueue) => {
    const nextState: Partial<PlayerState> = {
      currentTrack: track,
      youtubeVideoId: null,
      localAudioUrl: null,
      isEqActive: false,
      isPlaying: false,
      progress: 0,
      duration: 0,
      seekRequest: null,
    }

    if (newQueue) {
      const index = newQueue.findIndex((item) => item.id === track.id)
      nextState.queue = index >= 0 ? newQueue.slice(index) : newQueue
    }

    set(nextState)

    try {
      pushRecentPlay({
        kind: 'track',
        id: track.id,
        name: track.name,
        imageUrl: track.album?.images?.[0]?.url ?? '',
        artists: track.artists,
        album: track.album,
        duration_ms: track.duration_ms,
      })
    } catch {
      // ignore storage failures
    }

    try {
      recordTrackPlay(track)
    } catch {
      // ignore recommendation history failures
    }

    await startPlayback(track)
  },
  addToQueue: (track) => {
    const { queue, currentTrack } = get()

    if (!currentTrack || queue.length === 0) {
      set({ queue: [...queue, track] })
      return
    }

    const currentIndex = queue.findIndex((item) => item.id === currentTrack.id)
    if (currentIndex < 0) {
      set({ queue: [...queue, track] })
      return
    }

    const nextQueue = [...queue]
    nextQueue.splice(currentIndex + 1, 0, track)
    set({ queue: nextQueue })
  },
  playNext: async (track) => {
    const { currentTrack, queue } = get()

    if (!currentTrack || queue.length === 0) {
      await get().playTrack(track, [track])
      return
    }

    get().addToQueue(track)
  },
  startTrackStation: async (track) => {
    const seedArtist = track.artists?.[0]?.name?.trim()
    const query = seedArtist || track.name
    const related = await searchTracksByQuery(query, 16)

    const relatedPlayerTracks = related
      .filter((item) => item.id !== track.id)
      .slice(0, 15)
      .map(toPlayerTrackFromSearch)

    const stationQueue = [track, ...relatedPlayerTracks]
    await get().playTrack(track, stationQueue)
  },
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setVolume: (value) => set({ volume: Math.min(1, Math.max(0, value)) }),
  setProgress: (value) => set({ progress: value }),
  setDuration: (value) => set({ duration: value }),
  seekTo: (fraction) => {
    const clamped = Math.min(1, Math.max(0, fraction))
    set({ progress: clamped, seekRequest: clamped })
  },
  clearSeekRequest: () => set({ seekRequest: null }),
  toggleLyrics: () => set((state) => ({ isLyricsOpen: !state.isLyricsOpen })),
  closeLyrics: () => set({ isLyricsOpen: false }),
  handleNextTrack: async () => {
    const { queue, currentTrack } = get()

    if (queue.length === 0 || !currentTrack) {
      set({ isPlaying: false, progress: 0, isEqActive: false })
      return
    }

    const currentIndex = queue.findIndex((item) => item.id === currentTrack.id)
    const nextTrack =
      currentIndex >= 0 && currentIndex < queue.length - 1
        ? queue[currentIndex + 1]
        : undefined

    if (!nextTrack) {
      const { autoplaySimilar } = getAudioSettings()
      if (autoplaySimilar) {
        const seedArtist = currentTrack.artists?.[0]?.name?.trim()
        const query = seedArtist || currentTrack.name
        try {
          const related = await searchTracksByQuery(query, 16)
          const relatedPlayerTracks = related
            .filter((item) => item.id !== currentTrack.id)
            .slice(0, 15)
            .map(toPlayerTrackFromSearch)

          if (relatedPlayerTracks.length > 0) {
            await get().playTrack(relatedPlayerTracks[0], relatedPlayerTracks)
            return
          }
        } catch (error) {
          console.error('Falha no autoplay de semelhantes:', error)
        }
      }

      set({ isPlaying: false, progress: 0, isEqActive: false })
      return
    }

    set({
      currentTrack: nextTrack,
      youtubeVideoId: null,
      localAudioUrl: null,
      isEqActive: false,
      isPlaying: false,
      progress: 0,
      duration: 0,
      queue: queue.slice(currentIndex + 1),
    })

    try {
      pushRecentPlay({
        kind: 'track',
        id: nextTrack.id,
        name: nextTrack.name,
        imageUrl: nextTrack.album?.images?.[0]?.url ?? '',
        artists: nextTrack.artists,
        album: nextTrack.album,
        duration_ms: nextTrack.duration_ms,
      })
      recordTrackPlay(nextTrack)
    } catch {
      // ignore storage failures
    }

    await startPlayback(nextTrack)
  },
}))
