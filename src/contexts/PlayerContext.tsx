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
import { usePlayerStore } from '../store/usePlayerStore'

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
  const setStoreEqActive = usePlayerStore((s) => s.setEqActive)

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

  useEffect(() => {
    registerPlayerAudioElement(audioRef.current)

    if (!streamUrl) {
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
    }),
    [isEqActive, resumeAudioContext, markExternalFallback, getAudioElement],
  )

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  )
}

export function usePlayerAudio(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) {
    return {
      isEqActive: false,
      resumeAudioContext: async () => undefined,
      markExternalFallback: () => undefined,
      getAudioElement: () => sharedAudioElement,
    }
  }
  return ctx
}
