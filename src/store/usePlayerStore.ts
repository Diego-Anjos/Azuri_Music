import { create } from 'zustand'

const RESOLVE_URL = 'http://localhost:3001/api/stream'

export interface PlayerTrack {
  id: string
  name: string
  artists: Array<{ name: string }>
  album?: {
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
  playTrack: (track: PlayerTrack) => Promise<void>
  togglePlay: () => void
  setVolume: (value: number) => void
  setProgress: (value: number) => void
  setDuration: (value: number) => void
  handleNextTrack: () => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  youtubeVideoId: null,
  isPlaying: false,
  volume: 0.5,
  progress: 0,
  duration: 0,
  playTrack: async (track) => {
    set({
      currentTrack: track,
      youtubeVideoId: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
    })

    const artistName = track.artists?.[0]?.name ?? ''
    const query = `${track.name} ${artistName}`.trim()

    try {
      const response = await fetch(
        `${RESOLVE_URL}?query=${encodeURIComponent(query)}`,
      )

      if (!response.ok) {
        console.error('Falha ao resolver vídeo:', response.status)
        return
      }

      const data = (await response.json()) as {
        videoId?: string
        title?: string
      }

      if (!data.videoId) {
        console.error('Resposta sem videoId')
        return
      }

      set({
        youtubeVideoId: data.videoId,
        isPlaying: true,
      })
    } catch (error) {
      console.error('Erro ao resolver vídeo no YouTube:', error)
    }
  },
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setVolume: (value) => set({ volume: Math.min(1, Math.max(0, value)) }),
  setProgress: (value) => set({ progress: value }),
  setDuration: (value) => set({ duration: value }),
  handleNextTrack: () => set({ isPlaying: false, progress: 0 }),
}))
