import { create } from 'zustand'

export interface Track {
  id: string
  title: string
  artist: string
  coverUrl: string
  duration: number
}

interface PlayerState {
  currentTrack: Track | null
  isPlaying: boolean
  volume: number
  playTrack: (track: Track) => void
  togglePlay: () => void
  setVolume: (value: number) => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: {
    id: '1',
    title: 'Neon Horizon',
    artist: 'Azuri Collective',
    coverUrl: 'https://picsum.photos/seed/azuri/80/80',
    duration: 214,
  },
  isPlaying: false,
  volume: 50,
  playTrack: (track) => set({ currentTrack: track, isPlaying: true }),
  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setVolume: (value) => set({ volume: value }),
}))
