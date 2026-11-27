import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  getAudioSettings,
  getEffectiveEqGains,
  subscribeAudioSettings,
  type AudioSettings,
  type EqBands,
} from '../services/audioSettingsService'
import {
  usePlayerStore,
  type VideoDisplayMode,
} from '../store/usePlayerStore'
import {
  beginPlayRequest,
  getPlayRequestId,
  isPlayRequestCurrent,
  registerPlaybackAudioElement,
  resetNativeAudioElement,
} from '../services/playbackGuard'
import { appendListeningSeconds } from '../services/listeningStats'

type FilterBank = {
  subBass: BiquadFilterNode
  bass: BiquadFilterNode
  mid: BiquadFilterNode
  presence: BiquadFilterNode
  treble: BiquadFilterNode
}

type AudioGraph = {
  context: AudioContext
  source: MediaElementAudioSourceNode
  filters: FilterBank
  compressor: DynamicsCompressorNode
}

type PlayerContextValue = {
  /** true quando MediaElementSource conectou sem bloqueio CORS. */
  isEqActive: boolean
  /** Garante audioCtx.resume() na interação de play. */
  resumeAudioContext: () => Promise<void>
  /** Marca faixa atual como fallback externo (iframe / CORS). */
  markExternalFallback: () => void
  /** Elemento <audio> ativo do player (para sync 60fps das letras). */
  getAudioElement: () => HTMLAudioElement | null
  /**
   * Inicia play request: incrementa id, aborta stream anterior e reseta <audio>.
   * Usado para impedir troca cruzada de áudio entre cliques rápidos.
   */
  preparePlayRequest: () => { requestId: number; signal: AbortSignal }
  /** true se o requestId ainda é o play ativo. */
  isPlayRequestCurrent: (requestId: number) => boolean
  /** Modo Vídeo — estado espelhado do store + handoff Áudio↔Vídeo. */
  isVideoMode: boolean
  videoDisplayMode: VideoDisplayMode
  currentVideoId: string | null
  isLoadingVideo: boolean
  isOfficialClip: boolean
  toggleVideoMode: () => Promise<void>
  setVideoMode: (enabled: boolean) => Promise<void>
  setVideoDisplayMode: (mode: VideoDisplayMode) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

/** Um MediaElementSource por elemento — sobrevive a remounts do StrictMode. */
const graphByElement = new WeakMap<HTMLAudioElement, AudioGraph>()

/** Ponte global — LyricsView fica fora do Provider no App.tsx. */
let sharedAudioElement: HTMLAudioElement | null = null

export function getPlayerAudioElement(): HTMLAudioElement | null {
  return sharedAudioElement
}

export function registerPlayerAudioElement(el: HTMLAudioElement | null) {
  sharedAudioElement = el
  registerPlaybackAudioElement(el)
}

function applyEqGains(filters: FilterBank, gains: EqBands) {
  filters.subBass.gain.value = gains.subBass
  filters.bass.gain.value = gains.bass
  filters.mid.gain.value = gains.mid
  filters.presence.gain.value = gains.presence
  filters.treble.gain.value = gains.treble
}

function applySettingsToGraph(graph: AudioGraph, settings: AudioSettings) {
  applyEqGains(graph.filters, getEffectiveEqGains(settings))

  const { compressor } = graph
  if (settings.normalizeVolume) {
    compressor.threshold.value = -18
    compressor.knee.value = 12
    compressor.ratio.value = 8
    compressor.attack.value = 0.003
    compressor.release.value = 0.2
  } else {
    // Limiter leve anti-clipping mesmo com normalize off
    compressor.threshold.value = -3
    compressor.knee.value = 0
    compressor.ratio.value = 20
    compressor.attack.value = 0.001
    compressor.release.value = 0.1
  }
}

function createEqFilter(
  context: AudioContext,
  type: BiquadFilterType,
  frequency: number,
  Q = 1,
): BiquadFilterNode {
  const filter = context.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = Q
  filter.gain.value = 0
  return filter
}

function buildGraph(
  context: AudioContext,
  audio: HTMLAudioElement,
): AudioGraph {
  const source = context.createMediaElementSource(audio)

  const filters: FilterBank = {
    subBass: createEqFilter(context, 'lowshelf', 60),
    bass: createEqFilter(context, 'peaking', 230, 1.1),
    mid: createEqFilter(context, 'peaking', 910, 1.1),
    presence: createEqFilter(context, 'peaking', 3600, 1.1),
    treble: createEqFilter(context, 'highshelf', 14000),
  }

  const compressor = context.createDynamicsCompressor()

  // source → subBass → bass → mid → presence → treble → compressor → destination
  source.connect(filters.subBass)
  filters.subBass.connect(filters.bass)
  filters.bass.connect(filters.mid)
  filters.mid.connect(filters.presence)
  filters.presence.connect(filters.treble)
  filters.treble.connect(compressor)
  compressor.connect(context.destination)

  const graph = { context, source, filters, compressor }
  applySettingsToGraph(graph, getAudioSettings())
  return graph
}

function getOrCreateGraph(audio: HTMLAudioElement): AudioGraph | null {
  const existing = graphByElement.get(audio)
  if (existing && existing.context.state !== 'closed') {
    return existing
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AudioCtx) return null

    const context = new AudioCtx()
    const graph = buildGraph(context, audio)
    graphByElement.set(audio, graph)
    return graph
  } catch (error) {
    console.warn(
      '[Azuri EQ] Web Audio indisponível (CORS / elemento já conectado):',
      error,
    )
    return null
  }
}

type PlayerProviderProps = {
  children: ReactNode
  audioRef: RefObject<HTMLAudioElement | null>
  /** URL atual do <audio> (proxy / local). Null = modo externo. */
  streamUrl: string | null
}

/**
 * Grafo Web Audio + status isEqActive.
 * Envolve o player que possui o elemento <audio>.
 */
export function PlayerProvider({
  children,
  audioRef,
  streamUrl,
}: PlayerProviderProps) {
  const [isEqActive, setIsEqActive] = useState(false)
  const graphRef = useRef<AudioGraph | null>(null)
  /** Espelha o contador global — evita áudio stale ao trocar de faixa. */
  const playRequestIdRef = useRef(0)
  const setStoreEqActive = usePlayerStore((s) => s.setEqActive)
  const storePlayRequestId = usePlayerStore((s) => s.playRequestId)
  const isVideoMode = usePlayerStore((s) => s.isVideoMode)
  const videoDisplayMode = usePlayerStore((s) => s.videoDisplayMode)
  const currentVideoId = usePlayerStore((s) => s.currentVideoId)
  const isLoadingVideo = usePlayerStore((s) => s.isLoadingVideo)
  const isOfficialClip = usePlayerStore((s) => s.isOfficialClip)
  const toggleVideoMode = usePlayerStore((s) => s.toggleVideoMode)
  const setVideoMode = usePlayerStore((s) => s.setVideoMode)
  const setVideoDisplayMode = usePlayerStore((s) => s.setVideoDisplayMode)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const handleNextTrack = usePlayerStore((s) => s.handleNextTrack)
  const playPrevious = usePlayerStore((s) => s.playPrevious)

  useEffect(() => {
    playRequestIdRef.current = storePlayRequestId || getPlayRequestId()
  }, [storePlayRequestId])

  const syncEqFlag = useCallback(
    (active: boolean) => {
      setIsEqActive(active)
      setStoreEqActive(active)
    },
    [setStoreEqActive],
  )

  const markExternalFallback = useCallback(() => {
    syncEqFlag(false)
  }, [syncEqFlag])

  const resumeAudioContext = useCallback(async () => {
    const graph = graphRef.current
    if (!graph) return
    try {
      if (graph.context.state === 'suspended') {
        await graph.context.resume()
      }
    } catch {
      // ignore autoplay / resume failures
    }
  }, [])

  // Media Session — controles do SO / teclas multimídia com o browser minimizado
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      return
    }

    const artworkUrl = currentTrack.album?.images?.[0]?.url
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.name,
      artist: currentTrack.artists?.map((a) => a.name).join(', ') ?? '',
      album: currentTrack.album?.name ?? '',
      artwork: artworkUrl
        ? [
            { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
          ]
        : [],
    })

    navigator.mediaSession.setActionHandler('play', () => {
      void resumeAudioContext()
      if (!usePlayerStore.getState().isPlaying) togglePlay()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      if (usePlayerStore.getState().isPlaying) togglePlay()
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      void playPrevious()
    })
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      void handleNextTrack()
    })
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      const dur = usePlayerStore.getState().duration
      if (
        details.seekTime != null &&
        Number.isFinite(details.seekTime) &&
        dur > 0
      ) {
        seekTo(Math.min(1, Math.max(0, details.seekTime / dur)))
      }
    })

    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
        navigator.mediaSession.setActionHandler('seekto', null)
      } catch {
        // ignore
      }
    }
  }, [
    currentTrack,
    togglePlay,
    handleNextTrack,
    playPrevious,
    seekTo,
    resumeAudioContext,
  ])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    if (duration > 0 && Number.isFinite(progress)) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(duration, Math.max(0, progress * duration)),
          playbackRate: 1,
        })
      } catch {
        // setPositionState pode falhar se duration=0
      }
    }
  }, [isPlaying, progress, duration])

  // Meu Pulso — contabiliza segundos reais (áudio, vídeo e mini-player externo)
  const listeningAccRef = useRef(0)
  const listeningTrackRef = useRef(currentTrack)

  useEffect(() => {
    listeningTrackRef.current = currentTrack
  }, [currentTrack])

  useEffect(() => {
    if (!isPlaying || !currentTrack) {
      const pending = listeningAccRef.current
      const track = listeningTrackRef.current
      if (pending > 0 && track) {
        appendListeningSeconds(track, pending)
        listeningAccRef.current = 0
      }
      return
    }

    const trackId = currentTrack.id
    const intervalId = window.setInterval(() => {
      const track = listeningTrackRef.current
      if (!track || track.id !== trackId) return
      listeningAccRef.current += 1
      if (listeningAccRef.current >= 5) {
        appendListeningSeconds(track, listeningAccRef.current)
        listeningAccRef.current = 0
      }
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
      const pending = listeningAccRef.current
      const track = listeningTrackRef.current
      if (pending > 0 && track) {
        appendListeningSeconds(track, pending)
        listeningAccRef.current = 0
      }
    }
  }, [isPlaying, currentTrack?.id])

  // Nunca pausar ao minimizar — só retoma o AudioContext se o browser suspender
  useEffect(() => {
    const keepAlive = () => {
      if (document.visibilityState !== 'visible') {
        void resumeAudioContext()
        return
      }
      void resumeAudioContext()
      const audio = audioRef.current
      const state = usePlayerStore.getState()
      if (
        audio &&
        state.isPlaying &&
        !state.isVideoMode &&
        state.localAudioUrl &&
        audio.paused
      ) {
        void audio.play().catch(() => undefined)
      }
    }

    document.addEventListener('visibilitychange', keepAlive)
    window.addEventListener('focus', keepAlive)
    // Intencionalmente sem listener de blur que pause a reprodução
    return () => {
      document.removeEventListener('visibilitychange', keepAlive)
      window.removeEventListener('focus', keepAlive)
    }
  }, [audioRef, resumeAudioContext])

  const preparePlayRequest = useCallback(() => {
    const { requestId, signal } = beginPlayRequest()
    playRequestIdRef.current = requestId
    resetNativeAudioElement(audioRef.current)
    return { requestId, signal }
  }, [audioRef])

  const checkPlayRequestCurrent = useCallback((requestId: number) => {
    return (
      requestId === playRequestIdRef.current && isPlayRequestCurrent(requestId)
    )
  }, [])

  // Sem stream: limpa o <audio> nativo para não continuar tocando faixa anterior
  useEffect(() => {
    registerPlayerAudioElement(audioRef.current)
    if (!streamUrl) {
      resetNativeAudioElement(audioRef.current)
      graphRef.current = null
      syncEqFlag(false)
      return
    }

    let cancelled = false
    let raf = 0

    const connect = (): boolean => {
      if (cancelled) return false
      const audio = audioRef.current
      if (!audio) return false

      registerPlayerAudioElement(audio)

      try {
        if (audio.crossOrigin !== 'anonymous') {
          // Só força CORS em URLs http(s); data/blob não precisam
          if (/^https?:\/\//i.test(streamUrl)) {
            audio.crossOrigin = 'anonymous'
          }
        }

        const graph = getOrCreateGraph(audio)
        graphRef.current = graph

        if (!graph) {
          if (!cancelled) syncEqFlag(false)
          return true
        }

        if (graph.context.state === 'suspended') {
          void graph.context.resume().catch(() => undefined)
        }
        applySettingsToGraph(graph, getAudioSettings())
        if (!cancelled) syncEqFlag(true)
      } catch (error) {
        console.warn('[Azuri EQ] falha ao conectar grafo:', error)
        if (!cancelled) syncEqFlag(false)
      }

      return true
    }

    if (!connect()) {
      raf = window.requestAnimationFrame(() => {
        connect()
      })
    }

    const unsubscribe = subscribeAudioSettings(() => {
      const graph = graphRef.current
      if (!graph) return
      try {
        applySettingsToGraph(graph, getAudioSettings())
      } catch {
        // ignore
      }
    })

    return () => {
      cancelled = true
      if (raf) window.cancelAnimationFrame(raf)
      unsubscribe()
      // Não fecha o AudioContext aqui — StrictMode remonta e o elemento
      // só aceita createMediaElementSource uma única vez.
    }
  }, [audioRef, streamUrl, syncEqFlag])

  useEffect(() => {
    return () => {
      setStoreEqActive(false)
      if (sharedAudioElement === audioRef.current) {
        registerPlayerAudioElement(null)
      }
    }
  }, [audioRef, setStoreEqActive])

  const getAudioElement = useCallback(
    () => audioRef.current ?? sharedAudioElement,
    [audioRef],
  )

  const value = useMemo<PlayerContextValue>(
    () => ({
      isEqActive,
      resumeAudioContext,
      markExternalFallback,
      getAudioElement,
      preparePlayRequest,
      isPlayRequestCurrent: checkPlayRequestCurrent,
      isVideoMode,
      videoDisplayMode,
      currentVideoId,
      isLoadingVideo,
      isOfficialClip,
      toggleVideoMode,
      setVideoMode,
      setVideoDisplayMode,
    }),
    [
      isEqActive,
      resumeAudioContext,
      markExternalFallback,
      getAudioElement,
      preparePlayRequest,
      checkPlayRequestCurrent,
      isVideoMode,
      videoDisplayMode,
      currentVideoId,
      isLoadingVideo,
      isOfficialClip,
      toggleVideoMode,
      setVideoMode,
      setVideoDisplayMode,
    ],
  )

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  )
}

export function usePlayerAudio(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  const isVideoMode = usePlayerStore((s) => s.isVideoMode)
  const videoDisplayMode = usePlayerStore((s) => s.videoDisplayMode)
  const currentVideoId = usePlayerStore((s) => s.currentVideoId)
  const isLoadingVideo = usePlayerStore((s) => s.isLoadingVideo)
  const isOfficialClip = usePlayerStore((s) => s.isOfficialClip)
  const toggleVideoMode = usePlayerStore((s) => s.toggleVideoMode)
  const setVideoMode = usePlayerStore((s) => s.setVideoMode)
  const setVideoDisplayMode = usePlayerStore((s) => s.setVideoDisplayMode)

  if (!ctx) {
    return {
      isEqActive: false,
      resumeAudioContext: async () => undefined,
      markExternalFallback: () => undefined,
      getAudioElement: () => sharedAudioElement,
      preparePlayRequest: () => beginPlayRequest(),
      isPlayRequestCurrent,
      isVideoMode,
      videoDisplayMode,
      currentVideoId,
      isLoadingVideo,
      isOfficialClip,
      toggleVideoMode,
      setVideoMode,
      setVideoDisplayMode,
    }
  }
  return ctx
}
