import { create } from 'zustand'
import {
  buildStreamProxyUrl,
  getAudioSettings,
  isStreamProxyUrl,
} from '../services/audioSettingsService'
import { pushRecentPlay } from '../services/libraryStorage'
import { recordTrackPlay } from '../services/recommendationService'
import { searchTracksByQuery } from '../services/spotify'
import { resolveYoutubeVideoId } from '../services/youtubeResolveService'
import {
  extractYoutubeVideoId,
  resolveOfficialMusicVideo,
  writePinnedVideoId,
  type OfficialVideoAlternative,
} from '../services/videoService'
import {
  beginPlayRequest,
  getPlaybackAudioElement,
  getStreamAbortSignal,
  isPlayRequestCurrent,
  resetNativeAudioElement,
} from '../services/playbackGuard'

export type VideoDisplayMode = 'stage' | 'split-lyrics' | 'pip'
export type RepeatMode = 'off' | 'all'

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
  /** Link do videoclipe oficial (YouTube) — uploads do Studio. */
  videoUrl?: string
}

const PLAY_HISTORY_KEY = 'azuri_play_history'
const PLAY_HISTORY_MAX = 50
const PREV_RESTART_WINDOW_MS = 2500

/** Evita empilhar a faixa atual ao navegar com playPrevious. */
let suppressHistoryPush = false
/** Timestamp do último clique que reiniciou a faixa (>3s → 0:00). */
let lastPrevClickAt = 0

function loadPlayHistory(): PlayerTrack[] {
  try {
    const raw = sessionStorage.getItem(PLAY_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is PlayerTrack =>
        Boolean(item && typeof item === 'object' && 'id' in item && 'name' in item),
    )
  } catch {
    return []
  }
}

function persistPlayHistory(history: PlayerTrack[]) {
  try {
    sessionStorage.setItem(PLAY_HISTORY_KEY, JSON.stringify(history))
  } catch {
    // quota / private mode
  }
}

let playHistory: PlayerTrack[] = loadPlayHistory()

function pushToPlayHistory(track: PlayerTrack) {
  const top = playHistory[playHistory.length - 1]
  if (top?.id === track.id) return
  playHistory = [...playHistory, track].slice(-PLAY_HISTORY_MAX)
  persistPlayHistory(playHistory)
}

function popFromPlayHistory(): PlayerTrack | undefined {
  const track = playHistory.pop()
  persistPlayHistory(playHistory)
  return track
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
  /** Modo Vídeo — palco / split / PiP. */
  isVideoMode: boolean
  videoDisplayMode: VideoDisplayMode
  currentVideoId: string | null
  isLoadingVideo: boolean
  /** true = clipe real; false = fallback Art Track / capa. */
  isOfficialClip: boolean
  videoAlternatives: OfficialVideoAlternative[]
  videoChannel: string | null
  /** off | all — usado por playPrevious no fim/início da fila. */
  repeatMode: RepeatMode
  /** Monotonic id da última playTrack — UI / fallback checam stale loads. */
  playRequestId: number
  playTrack: (track: PlayerTrack, newQueue?: PlayerTrack[]) => Promise<void>
  addToQueue: (track: PlayerTrack) => void
  playNext: (track: PlayerTrack) => Promise<void>
  startTrackStation: (track: PlayerTrack) => Promise<void>
  togglePlay: () => void
  /** Interrompe reprodução e limpa faixa/fila (ex.: logout). */
  stopPlayback: () => void
  setVolume: (value: number) => void
  setProgress: (value: number) => void
  setDuration: (value: number) => void
  seekTo: (fraction: number) => void
  clearSeekRequest: () => void
  handleNextTrack: () => Promise<void>
  /** Alias Spotify-like: reinício >3s / histórico / fila anterior. */
  handlePreviousTrack: () => Promise<void>
  playPrevious: () => Promise<void>
  setRepeatMode: (mode: RepeatMode) => void
  toggleRepeat: () => void
  toggleLyrics: () => void
  closeLyrics: () => void
  setEqActive: (active: boolean) => void
  /** Fallback para iframe YouTube quando o proxy CORS falha. */
  fallbackToYoutube: () => Promise<void>
  /** Recarrega URL do proxy quando a qualidade muda. */
  refreshStreamQuality: () => void
  setVideoMode: (enabled: boolean) => Promise<void>
  toggleVideoMode: () => Promise<void>
  setVideoDisplayMode: (mode: VideoDisplayMode) => void
  /** Resolve / atualiza o videoclipe da faixa atual (sem mudar o modo). */
  resolveCurrentVideo: () => Promise<string | null>
  /** Troca o clipe atual (e opcionalmente fixa no localStorage). */
  selectVideoClip: (
    videoId: string,
    options?: { pin?: boolean; isOfficialClip?: boolean },
  ) => void
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

function trackStreamParams(track: PlayerTrack) {
  const artistName = track.artists?.[0]?.name ?? ''
  const title = track.name ?? ''
  const query = `${title} ${artistName}`.trim()
  const durationSec =
    track.duration_ms && track.duration_ms > 0
      ? track.duration_ms / 1000
      : undefined

  return {
    query,
    title: title || undefined,
    artist: artistName || undefined,
    duration: durationSec,
  }
}

async function startPlayback(
  track: PlayerTrack,
  requestId: number,
): Promise<void> {
  if (!isPlayRequestCurrent(requestId)) return

  // Uploads locais / data URLs / blob — Web Audio direto
  if (track.audioUrl) {
    const url = track.audioUrl
    const needsProxy =
      /^https?:\/\//i.test(url) &&
      !url.startsWith('http://localhost:3001/') &&
      !url.startsWith(window.location.origin)

    if (!isPlayRequestCurrent(requestId)) return

    usePlayerStore.setState({
      localAudioUrl: needsProxy
        ? buildStreamProxyUrl(trackStreamParams(track))
        : url,
      youtubeVideoId: null,
      isEqActive: false,
      isPlaying: true,
      duration: track.duration_ms ? track.duration_ms / 1000 : 0,
    })
    return
  }

  // Streams externos via proxy CORS → permite EQ / Web Audio
  const proxyUrl = buildStreamProxyUrl(trackStreamParams(track))
  if (!isPlayRequestCurrent(requestId)) return

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
  isVideoMode: false,
  videoDisplayMode: 'stage',
  currentVideoId: null,
  isLoadingVideo: false,
  isOfficialClip: true,
  videoAlternatives: [],
  videoChannel: null,
  repeatMode: 'off',
  playRequestId: 0,
  setEqActive: (active) => set({ isEqActive: active }),
  setRepeatMode: (mode) => set({ repeatMode: mode }),
  toggleRepeat: () =>
    set((state) => ({
      repeatMode: state.repeatMode === 'off' ? 'all' : 'off',
    })),
  setVideoDisplayMode: (mode) => {
    set({ videoDisplayMode: mode })
    if (mode === 'split-lyrics') {
      set({ isLyricsOpen: false })
    }
  },
  selectVideoClip: (videoId, options) => {
    const { currentTrack } = get()
    if (!videoId) return
    if (options?.pin && currentTrack) {
      const artist = currentTrack.artists?.[0]?.name ?? ''
      writePinnedVideoId(currentTrack.name, artist, videoId)
    }
    set({
      currentVideoId: videoId,
      isOfficialClip: options?.isOfficialClip ?? true,
      isLoadingVideo: false,
    })
  },
  resolveCurrentVideo: async () => {
    const { currentTrack } = get()
    if (!currentTrack) return null

    const fromUpload = currentTrack.videoUrl
      ? extractYoutubeVideoId(currentTrack.videoUrl)
      : null
    if (fromUpload) {
      set({
        currentVideoId: fromUpload,
        isLoadingVideo: false,
        isOfficialClip: true,
        videoAlternatives: [],
        videoChannel: null,
      })
      return fromUpload
    }

    set({ isLoadingVideo: true })
    try {
      const artist = currentTrack.artists?.[0]?.name ?? ''
      const durationSec =
        currentTrack.duration_ms && currentTrack.duration_ms > 0
          ? currentTrack.duration_ms / 1000
          : get().duration > 0
            ? get().duration
            : undefined
      const result = await resolveOfficialMusicVideo({
        title: currentTrack.name,
        artist,
        durationSec,
        signal: getStreamAbortSignal(),
      })
      if (get().currentTrack?.id !== currentTrack.id) return null
      const videoId = result?.videoId ?? null
      set({
        currentVideoId: videoId,
        isLoadingVideo: false,
        isOfficialClip: result?.isOfficialClip ?? true,
        videoAlternatives: result?.alternatives ?? [],
        videoChannel: result?.channel ?? null,
      })
      return videoId
    } catch {
      if (get().currentTrack?.id === currentTrack.id) {
        set({ isLoadingVideo: false })
      }
      return null
    }
  },
  setVideoMode: async (enabled) => {
    const state = get()
    if (enabled === state.isVideoMode) {
      if (enabled && !state.currentVideoId) {
        await get().resolveCurrentVideo()
      }
      return
    }

    if (!enabled) {
      // Vídeo → Áudio: devolve o tempo atual e retoma o <audio>
      const { progress, isPlaying } = get()
      set({
        isVideoMode: false,
        videoDisplayMode: 'stage',
        isLoadingVideo: false,
      })
      const audio = getPlaybackAudioElement()
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = Math.min(
          audio.duration,
          Math.max(0, progress * audio.duration),
        )
        if (isPlaying) {
          void audio.play().catch(() => undefined)
        }
      } else {
        get().seekTo(progress)
      }
      return
    }

    if (!state.currentTrack) return

    // Áudio → Vídeo: pausa o <audio> nativo e abre no mesmo currentTime
    const audio = getPlaybackAudioElement()
    if (audio) audio.pause()

    const handoffProgress = state.progress
    set({
      isVideoMode: true,
      videoDisplayMode: 'stage',
      isLoadingVideo: true,
      progress: handoffProgress,
      seekRequest: handoffProgress,
    })

    const videoId = await get().resolveCurrentVideo()
    if (!videoId) {
      // Sem clipe: volta ao áudio sem perder posição
      set({ isVideoMode: false, isLoadingVideo: false })
      if (audio && state.isPlaying) {
        void audio.play().catch(() => undefined)
      }
    }
  },
  toggleVideoMode: async () => {
    await get().setVideoMode(!get().isVideoMode)
  },
  refreshStreamQuality: () => {
    const { localAudioUrl, currentTrack } = get()
    if (!currentTrack || !isStreamProxyUrl(localAudioUrl)) return
    const nextUrl = buildStreamProxyUrl(trackStreamParams(currentTrack))
    if (nextUrl === localAudioUrl) return
    set({
      localAudioUrl: nextUrl,
      progress: 0,
      isEqActive: false,
    })
  },
  fallbackToYoutube: async () => {
    const { currentTrack, playRequestId } = get()
    if (!currentTrack || currentTrack.audioUrl) return

    const requestId = playRequestId
    const trackSnapshot = currentTrack
    const videoId = await resolveYoutubeVideoId(
      trackSnapshot,
      getStreamAbortSignal(),
    )

    // Impede que um fallback antigo atropelo a faixa atual
    if (!isPlayRequestCurrent(requestId)) return
    if (get().currentTrack?.id !== trackSnapshot.id) return

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
    const { currentTrack } = get()
    const skipHistory = suppressHistoryPush
    suppressHistoryPush = false

    if (
      currentTrack &&
      currentTrack.id !== track.id &&
      !skipHistory
    ) {
      pushToPlayHistory(currentTrack)
    }

    const { requestId } = beginPlayRequest()
    resetNativeAudioElement()

    const nextState: Partial<PlayerState> = {
      currentTrack: track,
      youtubeVideoId: null,
      localAudioUrl: null,
      isEqActive: false,
      isPlaying: false,
      progress: 0,
      duration: 0,
      seekRequest: null,
      currentVideoId: null,
      isLoadingVideo: false,
      isOfficialClip: true,
      videoAlternatives: [],
      videoChannel: null,
      playRequestId: requestId,
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

    if (!isPlayRequestCurrent(requestId)) return
    await startPlayback(track, requestId)

    if (get().isVideoMode && isPlayRequestCurrent(requestId)) {
      void get().resolveCurrentVideo()
    }
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
  stopPlayback: () => {
    const { requestId } = beginPlayRequest()
    resetNativeAudioElement()
    set({
      currentTrack: null,
      youtubeVideoId: null,
      localAudioUrl: null,
      isEqActive: false,
      isPlaying: false,
      progress: 0,
      duration: 0,
      seekRequest: null,
      queue: [],
      isLyricsOpen: false,
      isVideoMode: false,
      videoDisplayMode: 'stage',
      currentVideoId: null,
      isLoadingVideo: false,
      isOfficialClip: true,
      videoAlternatives: [],
      videoChannel: null,
      playRequestId: requestId,
    })
  },
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
  handlePreviousTrack: async () => {
    const { progress, duration, seekTo, queue, currentTrack, repeatMode } =
      get()
    const currentTime = duration > 0 ? progress * duration : 0
    const now = Date.now()
    const recentRestart = now - lastPrevClickAt < PREV_RESTART_WINDOW_MS

    // 1) Reinício: >3s e sem double-click recente
    if (currentTime > 3 && !recentRestart) {
      seekTo(0)
      lastPrevClickAt = now
      return
    }

    lastPrevClickAt = now

    if (!currentTrack) {
      seekTo(0)
      return
    }

    const currentIndex = queue.findIndex((item) => item.id === currentTrack.id)

    // 2) Faixa anterior na fila atual
    if (queue.length > 1 && currentIndex > 0) {
      const prevTrack = queue[currentIndex - 1]
      suppressHistoryPush = true
      await get().playTrack(prevTrack, queue.slice(currentIndex - 1))
      return
    }

    // 3) Histórico real de reprodução
    const fromHistory = popFromPlayHistory()
    if (fromHistory) {
      suppressHistoryPush = true
      const nextQueue = [
        fromHistory,
        ...queue.filter((item) => item.id !== fromHistory.id),
      ]
      await get().playTrack(fromHistory, nextQueue)
      return
    }

    // 4) Repeat all no início da fila → última faixa
    if (repeatMode === 'all' && queue.length > 1 && currentIndex <= 0) {
      const lastTrack = queue[queue.length - 1]
      suppressHistoryPush = true
      await get().playTrack(lastTrack, queue)
      return
    }

    // 5) Sem anterior — reinicia a atual
    seekTo(0)
  },
  playPrevious: async () => {
    await get().handlePreviousTrack()
  },
  handleNextTrack: async () => {
    const { queue, currentTrack, repeatMode } = get()

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
      if (repeatMode === 'all' && queue.length > 0) {
        pushToPlayHistory(currentTrack)
        suppressHistoryPush = true
        await get().playTrack(queue[0], queue)
        return
      }

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

    pushToPlayHistory(currentTrack)

    const { requestId } = beginPlayRequest()
    resetNativeAudioElement()

    set({
      currentTrack: nextTrack,
      youtubeVideoId: null,
      localAudioUrl: null,
      isEqActive: false,
      isPlaying: false,
      progress: 0,
      duration: 0,
      currentVideoId: null,
      isLoadingVideo: false,
      isOfficialClip: true,
      videoAlternatives: [],
      videoChannel: null,
      playRequestId: requestId,
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

    if (!isPlayRequestCurrent(requestId)) return
    await startPlayback(nextTrack, requestId)

    if (get().isVideoMode && isPlayRequestCurrent(requestId)) {
      void get().resolveCurrentVideo()
    }
  },
}))
