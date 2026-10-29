import { create } from 'zustand'

const RESOLVE_URL = 'http://localhost:3001/api/stream'

export interface Track {
  id: string
  title: string
  artist: string
  coverUrl: string
  duration: number
}

interface PlayerState {
  currentTrack: Track | null
  youtubeVideoId: string | null
  isPlaying: boolean
  volume: number
  progress: number
  playTrack: (track: Track) => Promise<void>
  togglePlay: () => void
  setVolume: (value: number) => void
  setProgress: (seconds: number) => void
  handleNextTrack: () => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  youtubeVideoId: null,
  isPlaying: false,
  volume: 50,
  progress: 0,
  playTrack: async (track) => {
    set({
      currentTrack: track,
      youtubeVideoId: null,
      isPlaying: false,
      progress: 0,
    })

    const query = `${track.title} ${track.artist}`

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
  setVolume: (value) => set({ volume: value }),
  setProgress: (seconds) => set({ progress: seconds }),
  handleNextTrack: () => set({ isPlaying: false, progress: 0 }),
}))
