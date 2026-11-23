import { create } from 'zustand'
import { searchTracksByQuery } from '../services/spotify'

const RESOLVE_URL = 'http://localhost:3001/api/stream'

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
}

interface PlayerState {
  currentTrack: PlayerTrack | null
  youtubeVideoId: string | null
  isPlaying: boolean
  volume: number
  progress: number
  duration: number
  /** Fração 0–1 pedida ao ReactPlayer; consumida e limpa pelo MusicPlayer. */
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

async function resolveYoutubeVideoId(track: PlayerTrack): Promise<string | null> {
  const artistName = track.artists?.[0]?.name ?? ''
  const query = `${track.name} ${artistName}`.trim()

  try {
    const response = await fetch(
      `${RESOLVE_URL}?query=${encodeURIComponent(query)}`,
    )

    if (!response.ok) {
      console.error('Falha ao resolver vídeo:', response.status)
      return null
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

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  youtubeVideoId: null,
  isPlaying: false,
  volume: 0.5,
  progress: 0,
  duration: 0,
  seekRequest: null,
  queue: [],
  isLyricsOpen: false,
  playTrack: async (track, newQueue) => {
    const nextState: Partial<PlayerState> = {
      currentTrack: track,
      youtubeVideoId: null,
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

    const videoId = await resolveYoutubeVideoId(track)
    if (!videoId) return

    set({
      youtubeVideoId: videoId,
      isPlaying: true,
    })
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
      set({ isPlaying: false, progress: 0 })
      return
    }

    const currentIndex = queue.findIndex((item) => item.id === currentTrack.id)
    const nextTrack =
      currentIndex >= 0 && currentIndex < queue.length - 1
        ? queue[currentIndex + 1]
        : undefined

    if (!nextTrack) {
      set({ isPlaying: false, progress: 0 })
      return
    }

    set({
      currentTrack: nextTrack,
      youtubeVideoId: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      queue: queue.slice(currentIndex + 1),
    })

    const videoId = await resolveYoutubeVideoId(nextTrack)
    if (!videoId) return

    set({
      youtubeVideoId: videoId,
      isPlaying: true,
    })
  },
}))
