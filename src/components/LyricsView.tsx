import {
  CheckCircle2,
  ChevronDown,
  Crosshair,
  ExternalLink,
  Mic2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getPlayerAudioElement } from '../contexts/PlayerContext'
import {
  buildExternalLyricsSearchUrl,
  cleanTrackTitle,
  clearLyricsCache,
  fetchLyrics,
  fetchLyricsFromCandidate,
  getPlainLyricLines,
  primaryArtistName,
  readLyricsTiming,
  recalculateSmartSyncWithAudio,
  saveCustomLrc,
  saveCustomLyrics,
  searchLyricsCandidates,
  shouldUpgradeWithGemini,
  syncLyricsWithGemini,
  writeLyricsTiming,
  type LyricLine,
  type LyricsResult,
  type LyricsSearchCandidate,
} from '../services/lyricsService'
import { usePlayerStore } from '../store/usePlayerStore'

type AiSyncUiStatus = 'idle' | 'listening' | 'done' | 'error' | 'mismatch'

const ICON_STROKE = 1.5
const OFFSET_STEP = 0.5
const OFFSET_FINE_STEP = 0.1

function formatOffsetLabel(offset: number): string {
  if (Math.abs(offset) < 0.05) return '0.00s'
  const sign = offset > 0 ? '+' : ''
  return `${sign}${offset.toFixed(2)}s`
}

/** Busca binária — O(log n) para destacar o verso ativo a 60fps. */
function findActiveLineIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1
  let lo = 0
  let hi = lines.length - 1
  let active = 0

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= currentTime) {
      active = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return active
}

/** <audio> nativo realmente em reprodução (não o stub parado do fallback YouTube). */
function isActiveNativeAudio(
  audio: HTMLAudioElement | null,
): audio is HTMLAudioElement {
  return Boolean(
    audio &&
      !audio.paused &&
      audio.readyState >= 2 &&
      Number.isFinite(audio.currentTime) &&
      audio.currentTime > 0,
  )
}

type StoreClockSample = {
  baseTime: number
  basePerf: number
  duration: number
  isPlaying: boolean
}

/**
 * Relógio híbrido: prioriza <audio> nativo; no fallback YouTube interpola o
 * currentTime do player (progress × duration) com performance.now() a 60fps.
 */
function readHybridClock(store: StoreClockSample): {
  currentTime: number
  duration: number
} {
  const audio = getPlayerAudioElement()

  const audioDuration =
    audio && Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : 0
  const duration =
    audioDuration > 0
      ? audioDuration
      : store.duration > 0
        ? store.duration
        : 0

  if (isActiveNativeAudio(audio)) {
    return { currentTime: audio.currentTime, duration }
  }

  let currentTime = store.baseTime
  if (store.isPlaying) {
    currentTime += (performance.now() - store.basePerf) / 1000
  }

  if (duration > 0) {
    currentTime = Math.min(Math.max(0, currentTime), duration)
  } else {
    currentTime = Math.max(0, currentTime)
  }

  return { currentTime, duration }
}

/** Compat: leituras pontuais a partir do estado Zustand (progress 0–1). */
function readAudioClock(
  storeProgress: number,
  storeDuration: number,
  playing = false,
): { currentTime: number; duration: number } {
  const baseTime =
    storeDuration > 0 && Number.isFinite(storeProgress)
      ? storeProgress * storeDuration
      : 0
  return readHybridClock({
    baseTime,
    basePerf: performance.now(),
    duration: storeDuration,
    isPlaying: playing,
  })
}

export function LyricsView() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const closeLyrics = usePlayerStore((s) => s.closeLyrics)

  const [lyrics, setLyrics] = useState<LyricsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [tapSyncActive, setTapSyncActive] = useState(false)
  const [tapIndex, setTapIndex] = useState(0)
  const [syncOffset, setSyncOffset] = useState(0)
  const [manualTitle, setManualTitle] = useState('')
  const [manualArtist, setManualArtist] = useState('')
  const [manualSearching, setManualSearching] = useState(false)
  const [manualLoadingId, setManualLoadingId] = useState<string | null>(null)
  const [manualCandidates, setManualCandidates] = useState<
    LyricsSearchCandidate[]
  >([])
  const [manualError, setManualError] = useState<string | null>(null)
  const [activeLineIndex, setActiveLineIndex] = useState(-1)
  const [clockTime, setClockTime] = useState(0)
  const [aiSyncStatus, setAiSyncStatus] = useState<AiSyncUiStatus>('idle')
  const [isAiSyncing, setIsAiSyncing] = useState(false)
  const [backendOffline, setBackendOffline] = useState(false)

  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const lastActiveRef = useRef(-1)
  const tapIndexRef = useRef(0)
  const tapSyncActiveRef = useRef(false)
  const tappedLinesRef = useRef<LyricLine[]>([])
  const lyricsRef = useRef<LyricsResult | null>(null)
  const currentTimeRef = useRef(0)
  const syncOffsetRef = useRef(0)
  const trackIdRef = useRef<string | null>(null)
  /** Faixa ativa para a qual a UI pode aplicar resultados de letra/AI-sync. */
  const activeTrackIdRef = useRef<string | null>(null)
  const lyricsAbortRef = useRef<AbortController | null>(null)
  const aiSyncAbortRef = useRef<AbortController | null>(null)
  const lastSmartDurationRef = useRef(0)
  const autoAiKeyRef = useRef<string | null>(null)
  const aiSyncInFlightRef = useRef(false)
  const storeClockRef = useRef<StoreClockSample>({
    baseTime: 0,
    basePerf: performance.now(),
    duration: 0,
    isPlaying: false,
  })

  const coverUrl = currentTrack?.album?.images?.[0]?.url
  const title = currentTrack?.name ?? 'Nenhuma música'
  const artistName =
    currentTrack?.artists?.map((a) => a.name).join(', ') ?? ''
  const localAudioUrl = usePlayerStore((s) => s.localAudioUrl)
  const hasLiveSync = Boolean(lyrics?.synced && lyrics.lines.length > 0)
  const isAiSynced = Boolean(lyrics?.isAiSynced)
  const isExactSync =
    Boolean(lyrics) &&
    !lyrics!.isEstimated &&
    !isAiSynced &&
    (lyrics!.source === 'custom-lrc' ||
      lyrics!.source === 'custom' ||
      Boolean(lyrics!.source?.includes('lrclib-synced')))

  lyricsRef.current = lyrics
  tapIndexRef.current = tapIndex
  tapSyncActiveRef.current = tapSyncActive
  syncOffsetRef.current = syncOffset
  currentTimeRef.current = clockTime
  trackIdRef.current = currentTrack?.id ?? null

  // Só rebases quando o player store muda — NÃO a cada frame do RAF
  useEffect(() => {
    storeClockRef.current = {
      baseTime:
        duration > 0 && Number.isFinite(progress) ? progress * duration : 0,
      basePerf: performance.now(),
      duration: duration > 0 ? duration : 0,
      isPlaying,
    }
  }, [progress, duration, isPlaying, currentTrack?.id])

  useEffect(() => {
    // Aborta buscas / AI-sync da faixa anterior imediatamente
    lyricsAbortRef.current?.abort()
    aiSyncAbortRef.current?.abort()
    aiSyncInFlightRef.current = false

    if (!currentTrack) {
      activeTrackIdRef.current = null
      setLyrics(null)
      setError(null)
      setLoading(false)
      setShowPaste(false)
      setTapSyncActive(false)
      setTapIndex(0)
      setSyncOffset(0)
      setActiveLineIndex(-1)
      setClockTime(0)
      setManualTitle('')
      setManualArtist('')
      setManualCandidates([])
      setManualError(null)
      setManualSearching(false)
      setManualLoadingId(null)
      setAiSyncStatus('idle')
      setIsAiSyncing(false)
      setBackendOffline(false)
      tappedLinesRef.current = []
      lastSmartDurationRef.current = 0
      return
    }

    const targetTrackId = currentTrack.id
    activeTrackIdRef.current = targetTrackId

    const controller = new AbortController()
    lyricsAbortRef.current = controller

    // Limpa versos antigos antes de carregar a nova música
    setLyrics(null)
    setError(null)
    setLoading(true)
    setShowPaste(false)
    setPasteText('')
    setTapSyncActive(false)
    setTapIndex(0)
    tappedLinesRef.current = []
    lastActiveRef.current = -1
    lastSmartDurationRef.current = 0
    setAiSyncStatus('idle')
    setIsAiSyncing(false)
    setActiveLineIndex(-1)

    setSyncOffset(readLyricsTiming(targetTrackId).offsetSeconds)
    setManualTitle(cleanTrackTitle(currentTrack.name) || currentTrack.name)
    setManualArtist(
      primaryArtistName(
        currentTrack.artists?.map((a) => a.name).join(', ') ?? '',
      ),
    )
    setManualCandidates([])
    setManualError(null)
    autoAiKeyRef.current = null

    async function load() {
      const { duration: audioDuration } = readAudioClock(
        usePlayerStore.getState().progress,
        usePlayerStore.getState().duration,
      )
      const durationMs =
        audioDuration > 0
          ? Math.round(audioDuration * 1000)
          : currentTrack!.duration_ms

      let result = await fetchLyrics({
        trackId: targetTrackId,
        trackName: currentTrack!.name,
        artistName: currentTrack!.artists?.[0]?.name ?? '',
        albumName: currentTrack!.album?.name,
        durationMs,
        signal: controller.signal,
      })

      if (activeTrackIdRef.current !== targetTrackId || controller.signal.aborted) {
        return
      }

      if (result?.isEstimated && audioDuration > 0) {
        result = await recalculateSmartSyncWithAudio(result, audioDuration, {
          audioUrl: usePlayerStore.getState().localAudioUrl,
          audioElement: getPlayerAudioElement(),
        })
        if (activeTrackIdRef.current !== targetTrackId || controller.signal.aborted) {
          return
        }
        lastSmartDurationRef.current = audioDuration
      }

      if (activeTrackIdRef.current !== targetTrackId || controller.signal.aborted) {
        return
      }

      const hasVerses = Boolean(result && result.lines.length > 0)
      setLyrics(hasVerses ? result : null)
      setLoading(false)
      if (!hasVerses) setError('Letra não encontrada')
      else if (result?.isAiSynced) setAiSyncStatus('done')
    }

    void load()

    return () => {
      controller.abort()
    }
  }, [currentTrack?.id])

  // Clock 60fps: <audio> nativo OU interpolação do progresso do player (YouTube)
  useEffect(() => {
    let raf = 0
    let running = true

    const tick = () => {
      if (!running) return
      const { currentTime: now } = readHybridClock(storeClockRef.current)
      setClockTime(now)

      const current = lyricsRef.current
      if (tapSyncActiveRef.current) {
        setActiveLineIndex(
          Math.min(
            tapIndexRef.current,
            Math.max((current?.lines.length ?? 1) - 1, 0),
          ),
        )
      } else if (current?.synced && current.lines.length > 0) {
        setActiveLineIndex(
          findActiveLineIndex(
            current.lines,
            now - syncOffsetRef.current,
          ),
        )
      } else {
        setActiveLineIndex(-1)
      }

      if (isPlaying || tapSyncActiveRef.current) {
        raf = window.requestAnimationFrame(tick)
      }
    }

    tick()
    if (isPlaying || tapSyncActive) {
      raf = window.requestAnimationFrame(tick)
    }

    return () => {
      running = false
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [isPlaying, tapSyncActive, lyrics?.lines])

  // Quando o player revela a duração real, recalcula smart sync com análise vocal
  useEffect(() => {
    const targetTrackId = currentTrack?.id ?? null
    const { duration: audioDuration } = readAudioClock(progress, duration)
    if (audioDuration <= 0) return
    if (Math.abs(audioDuration - lastSmartDurationRef.current) < 0.5) return

    let cancelled = false
    lastSmartDurationRef.current = audioDuration

    void (async () => {
      const prev = lyricsRef.current
      if (!prev?.isEstimated || prev.isAiSynced || !prev.plainText) return
      const next = await recalculateSmartSyncWithAudio(prev, audioDuration, {
        audioUrl: localAudioUrl,
        audioElement: getPlayerAudioElement(),
      })
      // Não sobrescrever se o Gemini já alinhou ou a faixa mudou
      if (
        cancelled ||
        activeTrackIdRef.current !== targetTrackId ||
        lyricsRef.current?.isAiSynced
      ) {
        return
      }
      setLyrics(next)
    })()

    return () => {
      cancelled = true
    }
  }, [duration, progress, currentTrack?.id, localAudioUrl])

  // Scroll suave para o verso ativo — apenas no container rolável das letras
  useEffect(() => {
    if (!isPlaying && !tapSyncActive) return
    if (activeLineIndex < 0 || activeLineIndex === lastActiveRef.current) return
    lastActiveRef.current = activeLineIndex

    const lineEl = lineRefs.current[activeLineIndex]
    const container = scrollContainerRef.current
    if (!lineEl || !container) return

    const containerRect = container.getBoundingClientRect()
    const lineRect = lineEl.getBoundingClientRect()
    const nextTop =
      container.scrollTop +
      (lineRect.top - containerRect.top) -
      containerRect.height / 2 +
      lineRect.height / 2

    container.scrollTo({ top: nextTop, behavior: 'smooth' })
  }, [activeLineIndex, isPlaying, tapSyncActive])

  function persistOffset(next: number) {
    if (!currentTrack) return
    writeLyricsTiming(currentTrack.id, { offsetSeconds: next })
  }

  function adjustSyncOffset(delta: number) {
    if (!currentTrack) return
    setSyncOffset((prev) => {
      const next = Math.round((prev + delta) * 100) / 100
      persistOffset(next)
      lastActiveRef.current = -1
      return next
    })
  }

  function handleAnchorLine(line: LyricLine) {
    if (!currentTrack) return
    const { currentTime: now } = readAudioClock(progress, duration)
    const newOffset = Math.round((now - line.time) * 100) / 100
    setSyncOffset(newOffset)
    persistOffset(newOffset)
    lastActiveRef.current = -1
    setActiveLineIndex(findActiveLineIndex(lyrics?.lines ?? [], now - newOffset))
  }

  async function handleRecalculateSync() {
    if (!currentTrack || !lyrics?.plainText || !lyrics.isEstimated) return
    const { duration: audioDuration } = readAudioClock(progress, duration)
    const durationSec =
      audioDuration > 0
        ? audioDuration
        : (currentTrack.duration_ms ?? 0) > 0
          ? currentTrack.duration_ms! / 1000
          : 0
    lastSmartDurationRef.current = durationSec
    lastActiveRef.current = -1
    const next = await recalculateSmartSyncWithAudio(lyrics, durationSec, {
      audioUrl: localAudioUrl,
      audioElement: getPlayerAudioElement(),
    })
    setLyrics(next)
    setSyncOffset(0)
    persistOffset(0)
  }

  function resolveCurrentAudioSrc(): string | null {
    const audio = getPlayerAudioElement()
    const fromElement = (audio?.currentSrc || audio?.src || '').trim()
    if (fromElement && !/^blob:/i.test(fromElement)) return fromElement

    const fromStore = localAudioUrl?.trim()
    if (fromStore && !/^blob:/i.test(fromStore)) return fromStore

    const trackAny = currentTrack as
      | (typeof currentTrack & {
          streamUrl?: string
          previewUrl?: string
          audioUrl?: string
        })
      | null
    const fromTrack = (
      trackAny?.streamUrl ||
      trackAny?.previewUrl ||
      trackAny?.audioUrl ||
      ''
    ).trim()
    if (fromTrack && !/^blob:/i.test(fromTrack)) return fromTrack

    // Vazio → backend resolve stream por title+artist
    return ''
  }

  async function runAiSync(options?: { force?: boolean }) {
    if (!currentTrack || !lyrics) return
    if (aiSyncInFlightRef.current) return
    if (!options?.force && lyrics.isAiSynced) return

    const targetTrackId = currentTrack.id
    const plainLines = getPlainLyricLines(lyrics)
    if (plainLines.length === 0) {
      setAiSyncStatus('error')
      return
    }

    aiSyncAbortRef.current?.abort()
    const controller = new AbortController()
    aiSyncAbortRef.current = controller

    const audioSrc = resolveCurrentAudioSrc()
    const { duration: audioDuration } = readAudioClock(
      progress,
      duration,
      isPlaying,
    )
    aiSyncInFlightRef.current = true
    setIsAiSyncing(true)
    setAiSyncStatus('listening')
    setBackendOffline(false)

    try {
      const outcome = await syncLyricsWithGemini(
        currentTrack,
        plainLines,
        audioSrc,
        {
          force: options?.force === true,
          signal: controller.signal,
          durationSec:
            audioDuration > 0
              ? audioDuration
              : (currentTrack.duration_ms ?? 0) > 0
                ? currentTrack.duration_ms! / 1000
                : undefined,
        },
      )

      if (
        activeTrackIdRef.current !== targetTrackId ||
        controller.signal.aborted ||
        outcome.status === 'aborted'
      ) {
        return
      }

      if (outcome.status === 'mismatch') {
        setAiSyncStatus('mismatch')
        setError(
          outcome.reason ||
            'A letra encontrada não corresponde ao áudio desta faixa. Troque ou busque outra versão.',
        )
        return
      }

      if (outcome.status !== 'ok') {
        setAiSyncStatus('error')
        return
      }

      if (activeTrackIdRef.current !== targetTrackId) return

      // Atualiza versos + zera offset antigo para não desalinear a IA
      setLyrics(outcome.lyrics)
      setSyncOffset(0)
      persistOffset(0)
      lastActiveRef.current = -1
      setAiSyncStatus('done')
      setError(null)
    } catch (error) {
      if (activeTrackIdRef.current !== targetTrackId) return
      const message =
        error instanceof Error ? error.message : String(error ?? '')
      const offline =
        /failed to fetch|networkerror|load failed|err_connection/i.test(
          message,
        ) || error instanceof TypeError

      if (offline) {
        setBackendOffline(true)
      }
      setAiSyncStatus('error')
    } finally {
      if (activeTrackIdRef.current === targetTrackId) {
        setIsAiSyncing(false)
        aiSyncInFlightRef.current = false
      }
    }
  }

  // Upgrade automático: mostra a letra na hora e sincroniza com Gemini em background
  // (inclui caches antigos sem isAiSynced / sem LRC oficial)
  useEffect(() => {
    if (!currentTrack || loading) return
    if (!shouldUpgradeWithGemini(lyrics)) return
    if (isExactSync) return

    const key = `${currentTrack.id}::${lyrics?.source ?? ''}::${lyrics?.lines[0]?.text ?? ''}`
    if (autoAiKeyRef.current === key) return
    autoAiKeyRef.current = key

    let cancelled = false
    void (async () => {
      await runAiSync()
      if (cancelled) return
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentTrack?.id,
    loading,
    lyrics?.isEstimated,
    lyrics?.isAiSynced,
    lyrics?.source,
    lyrics?.lines?.length,
    localAudioUrl,
  ])

  function markTapAtCurrentTime() {
    const current = lyricsRef.current
    if (!current || !tapSyncActiveRef.current) return

    const index = tapIndexRef.current
    if (index >= current.lines.length) return

    const nextLine: LyricLine = {
      time: Number(currentTimeRef.current.toFixed(3)),
      text: current.lines[index].text,
    }

    const updated = [...tappedLinesRef.current]
    updated[index] = nextLine
    tappedLinesRef.current = updated

    const nextIndex = index + 1
    tapIndexRef.current = nextIndex
    setTapIndex(nextIndex)

    if (nextIndex >= current.lines.length) {
      const trackId = trackIdRef.current
      const finalLines = current.lines.map((line, i) => updated[i] ?? line)
      if (trackId) {
        // Converte para LRC e persiste em azuri_custom_lrc_${trackId}
        const saved = saveCustomLrc(trackId, finalLines)
        if (saved) setLyrics(saved)
        // Offset deixa de ser necessário — sync exacta
        setSyncOffset(0)
        writeLyricsTiming(trackId, { offsetSeconds: 0 })
      }
      tapSyncActiveRef.current = false
      setTapSyncActive(false)
      setTapIndex(0)
      tappedLinesRef.current = []
      lastActiveRef.current = -1
    }
  }

  useEffect(() => {
    if (!tapSyncActive) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' && event.key !== ' ') return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      markTapAtCurrentTime()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tapSyncActive])

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable)
      ) {
        return
      }
      closeLyrics()
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [closeLyrics])

  function handleLineClick(line: LyricLine) {
    if (tapSyncActive || !hasLiveSync) return
    const { duration: audioDuration } = readAudioClock(progress, duration)
    if (audioDuration <= 0) return
    // Compensa o offset: linha T fica ativa quando currentTime = T + syncOffset
    const targetTime = Math.max(0, line.time + syncOffset)
    seekTo(Math.min(1, Math.max(0, targetTime / audioDuration)))
  }

  function startTapSync() {
    if (!lyrics?.lines.length) return
    tappedLinesRef.current = []
    tapIndexRef.current = 0
    tapSyncActiveRef.current = true
    setTapSyncActive(true)
    setTapIndex(0)
    lastActiveRef.current = -1
    seekTo(0)
  }

  function cancelTapSync() {
    tapSyncActiveRef.current = false
    setTapSyncActive(false)
    setTapIndex(0)
    tappedLinesRef.current = []
  }

  function handleSaveCustom() {
    if (!currentTrack) return
    const { duration: audioDuration } = readAudioClock(progress, duration)
    const saved = saveCustomLyrics(
      currentTrack.id,
      pasteText,
      audioDuration > 0 ? audioDuration : undefined,
    )
    const hasVerses = Boolean(saved && saved.lines.length > 0)
    setLyrics(hasVerses ? saved : null)
    setShowPaste(false)
    setError(hasVerses ? null : 'Letra não encontrada')
    lastActiveRef.current = -1
  }

  async function handleManualSearch() {
    const q = `${manualArtist.trim()} ${manualTitle.trim()}`.trim()
    if (!q) {
      setManualError('Indica título e artista para pesquisar.')
      return
    }

    setManualSearching(true)
    setManualError(null)
    setManualCandidates([])

    const candidates = await searchLyricsCandidates(q)
    setManualCandidates(candidates)
    setManualSearching(false)

    if (candidates.length === 0) {
      setManualError(
        'Nenhum resultado. Ajusta o nome ou tenta colar a letra manualmente.',
      )
    }
  }

  async function handleSelectCandidate(candidate: LyricsSearchCandidate) {
    if (!currentTrack) return

    setManualLoadingId(candidate.id)
    setManualError(null)

    const playerDuration = usePlayerStore.getState().duration
    const durationMs =
      playerDuration > 0
        ? Math.round(playerDuration * 1000)
        : currentTrack.duration_ms

    const result = await fetchLyricsFromCandidate({
      trackId: currentTrack.id,
      candidate,
      durationMs,
    })

    setManualLoadingId(null)

    if (!result || result.lines.length === 0) {
      setManualError('Não foi possível carregar esta versão da letra.')
      return
    }

    setLyrics(result)
    setError(null)
    setShowPaste(false)
    lastActiveRef.current = -1
    if (playerDuration > 0) lastSmartDurationRef.current = playerDuration
  }

  function handleSwapLyrics() {
    if (!currentTrack) return

    clearLyricsCache(currentTrack.id)
    setLyrics(null)
    setError('Escolhe outra versão da letra ou cola o texto correto.')
    setShowPaste(false)
    setPasteText('')
    setTapSyncActive(false)
    setTapIndex(0)
    tappedLinesRef.current = []
    lastActiveRef.current = -1
    setManualCandidates([])
    setManualError(null)
    setAiSyncStatus('idle')
    autoAiKeyRef.current = null
    setManualTitle(cleanTrackTitle(currentTrack.name) || currentTrack.name)
    setManualArtist(
      primaryArtistName(
        currentTrack.artists?.map((a) => a.name).join(', ') ?? '',
      ),
    )
  }

  const searchUrl = buildExternalLyricsSearchUrl(title, artistName)
  const syncedLines = lyrics?.lines ?? []
  const hasSyncedVerses = syncedLines.length > 0
  // Toolbar só com versos reais; lista vazia = painel de busca (nunca tela preta)
  const showSyncToolbar = Boolean(hasSyncedVerses && !tapSyncActive)
  const showManualFallback =
    Boolean(currentTrack) && !loading && !hasSyncedVerses

  return (
    <div className="fixed top-0 right-0 bottom-30 left-0 z-40 flex flex-col overflow-hidden bg-[#080B12]/98 backdrop-blur-2xl md:left-60 md:bottom-20 lg:left-64">
      {coverUrl && (
        <div
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-25 blur-3xl"
          style={{ backgroundImage: `url(${coverUrl})` }}
          aria-hidden
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[#080B12]/80" />

      {/* Cabeçalho fixo — nunca rola com as letras */}
      <header className="relative z-20 shrink-0 border-b border-white/10 bg-[#080B12]/95 px-4 pt-4 pb-3 sm:px-8 sm:pt-5">
        <div className="flex items-center gap-3">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-lg sm:h-12 sm:w-12"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10 sm:h-12 sm:w-12">
              <Mic2 className="size-5 text-[#94A3B8]" strokeWidth={ICON_STROKE} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-white sm:text-base">
              {title}
            </h2>
            <p className="truncate text-xs text-gray-400 sm:text-sm">
              {artistName || '—'}
            </p>
          </div>

          <button
            type="button"
            onClick={closeLyrics}
            title="Fechar letras (Esc)"
            aria-label="Fechar letras"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3.5 py-2 text-white transition-all hover:border-cyan-400/50 hover:bg-cyan-500/20 hover:text-cyan-300"
          >
            <ChevronDown className="size-4" strokeWidth={ICON_STROKE} />
            <span className="text-xs font-semibold">Fechar</span>
          </button>
        </div>

        {backendOffline && (
          <p
            role="status"
            className="mt-2 text-[11px] text-amber-200/80"
          >
            Backend offline (porta 3001) — inicie o servidor para usar a IA.
          </p>
        )}

        {showSyncToolbar && (
          <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto border-t border-white/5 pt-3">
            {isExactSync ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide whitespace-nowrap text-cyan-300">
                <CheckCircle2
                  className="size-3.5 text-cyan-400"
                  strokeWidth={ICON_STROKE}
                />
                Sincronização salva (Exata)
              </span>
            ) : lyrics?.isEstimated && !isAiSynced ? (
              <>
                <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide whitespace-nowrap text-cyan-300">
                  Sincronização inteligente
                </span>
                <button
                  type="button"
                  onClick={handleRecalculateSync}
                  className="shrink-0 rounded-full border border-cyan-400/40 px-3 py-1 text-[11px] font-medium whitespace-nowrap text-cyan-300 transition-colors hover:border-cyan-400 hover:bg-cyan-400/10 hover:text-cyan-200"
                >
                  Recalcular
                </button>
                <button
                  type="button"
                  onClick={startTapSync}
                  className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium whitespace-nowrap text-[#F8FAFC] transition-colors hover:border-cyan-400/50 hover:text-cyan-400"
                >
                  Tap Sync
                </button>
              </>
            ) : !isAiSynced ? (
              <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide whitespace-nowrap text-cyan-300">
                Letra sincronizada
              </span>
            ) : null}

            {isAiSyncing || aiSyncStatus === 'listening' ? (
              <span className="inline-flex shrink-0 animate-pulse items-center gap-1.5 rounded-full border border-violet-400/50 bg-gradient-to-r from-cyan-400/20 to-violet-500/25 px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-cyan-100">
                <Sparkles
                  className="size-3.5 text-cyan-300"
                  strokeWidth={ICON_STROKE}
                />
                Ouvindo faixa...
              </span>
            ) : aiSyncStatus === 'mismatch' ? (
              <button
                type="button"
                onClick={handleSwapLyrics}
                title="A letra não corresponde ao áudio — buscar outra versão"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-amber-200 transition-colors hover:border-amber-300/70 hover:bg-amber-400/20"
              >
                Letra ≠ áudio — trocar
              </button>
            ) : isAiSynced || aiSyncStatus === 'done' ? (
              <button
                type="button"
                onClick={() => void runAiSync({ force: true })}
                title="Reexecutar alinhamento Gemini"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-400/15 px-3 py-1 text-[11px] font-semibold tracking-wide whitespace-nowrap text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.25)] transition-colors hover:border-cyan-300/70 hover:bg-cyan-400/20 hover:text-cyan-200"
              >
                <Sparkles
                  className="size-3.5 text-cyan-300"
                  strokeWidth={ICON_STROKE}
                />
                Sincronizado com Gemini
              </button>
            ) : shouldUpgradeWithGemini(lyrics) ? (
              <button
                type="button"
                onClick={() => void runAiSync({ force: true })}
                title="Alinhar versos ao áudio com Gemini"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-400/40 bg-gradient-to-r from-cyan-400/10 to-violet-500/15 px-3 py-1 text-[11px] font-semibold whitespace-nowrap text-cyan-200 transition-colors hover:border-cyan-300/60 hover:text-white"
              >
                <Sparkles
                  className="size-3.5 text-violet-300"
                  strokeWidth={ICON_STROKE}
                />
                Sincronizar com IA
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleSwapLyrics}
              title="Remover esta letra e buscar outra versão"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium whitespace-nowrap text-[#94A3B8] transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
            >
              <RefreshCw className="size-3" strokeWidth={ICON_STROKE} />
              Trocar letra
            </button>

            <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300">
              <button
                type="button"
                onClick={() => adjustSyncOffset(-OFFSET_STEP)}
                title="Adiantar letra (−0.5s)"
                aria-label="Adiantar letra 0.5 segundos"
                className="rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-cyan-400"
              >
                −0.5
              </button>
              <button
                type="button"
                onClick={() => adjustSyncOffset(-OFFSET_FINE_STEP)}
                title="Adiantar letra (−0.1s)"
                aria-label="Adiantar letra 0.1 segundos"
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-cyan-400"
              >
                <Minus className="size-3" strokeWidth={ICON_STROKE} />
                0.1
              </button>
              <span
                className={`min-w-[3.5rem] text-center font-mono tabular-nums ${
                  syncOffset === 0 ? 'text-gray-400' : 'text-cyan-400'
                }`}
                title="Deslocamento da letra"
              >
                {formatOffsetLabel(syncOffset)}
              </span>
              <button
                type="button"
                onClick={() => adjustSyncOffset(OFFSET_FINE_STEP)}
                title="Atrasar letra (+0.1s)"
                aria-label="Atrasar letra 0.1 segundos"
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-cyan-400"
              >
                <Plus className="size-3" strokeWidth={ICON_STROKE} />
                0.1
              </button>
              <button
                type="button"
                onClick={() => adjustSyncOffset(OFFSET_STEP)}
                title="Atrasar letra (+0.5s)"
                aria-label="Atrasar letra 0.5 segundos"
                className="rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-cyan-400"
              >
                +0.5
              </button>
            </div>
          </div>
        )}

        {tapSyncActive && lyrics && (
          <div className="no-scrollbar mt-3 flex items-center gap-3 overflow-x-auto border-t border-cyan-400/20 pt-3">
            <p className="shrink-0 text-sm whitespace-nowrap text-[#F8FAFC]">
              Marca o verso{' '}
              <span className="font-bold text-cyan-400">
                {Math.min(tapIndex + 1, lyrics.lines.length)}/
                {lyrics.lines.length}
              </span>
              <span className="text-[#94A3B8]"> · Espaço</span>
            </p>
            <button
              type="button"
              onClick={markTapAtCurrentTime}
              className="shrink-0 rounded-full bg-cyan-400 px-4 py-1.5 text-sm font-bold whitespace-nowrap text-gray-900 transition-transform hover:scale-105"
            >
              Marcar verso atual
            </button>
            <button
              type="button"
              onClick={cancelTapSync}
              className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-sm whitespace-nowrap text-[#94A3B8] hover:text-white"
            >
              Cancelar
            </button>
          </div>
        )}
      </header>

      {/* Só esta área rola */}
      <div
        ref={scrollContainerRef}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto scroll-smooth px-5 py-20 sm:px-12 sm:py-28 md:px-20"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent, black 10%, black 88%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, black 10%, black 88%, transparent)',
        }}
      >
        {!currentTrack && (
          <p className="text-center text-lg text-[#94A3B8]">
            Reproduza uma faixa para ver a letra.
          </p>
        )}

        {currentTrack && loading && (
          <p className="text-center text-lg text-cyan-400">A procurar letra…</p>
        )}

        {currentTrack && !loading && hasSyncedVerses && (
          <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
            {syncedLines.map((line, index) => {
              const isActive = index === activeLineIndex && !tapSyncActive
              const isPendingTap = tapSyncActive && index === tapIndex
              const isTapped = tapSyncActive && index < tapIndex

              const className =
                isActive || isPendingTap
                  ? 'min-w-0 flex-1 cursor-pointer text-left text-xl font-bold leading-relaxed text-cyan-400 opacity-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)] transition-colors duration-100 sm:text-2xl md:text-3xl'
                  : isTapped
                    ? 'min-w-0 flex-1 cursor-pointer text-left text-xl font-bold leading-relaxed text-white/50 transition-colors duration-100 sm:text-2xl md:text-3xl'
                    : 'min-w-0 flex-1 cursor-pointer text-left text-xl font-bold leading-relaxed text-white/30 transition-colors duration-100 hover:text-white/70 sm:text-2xl md:text-3xl'

              return (
                <div
                  key={`${line.text}-${index}`}
                  className="group relative flex items-center gap-2"
                >
                  <button
                    type="button"
                    ref={(el) => {
                      lineRefs.current[index] = el
                    }}
                    onClick={() =>
                      tapSyncActive
                        ? markTapAtCurrentTime()
                        : handleLineClick(line)
                    }
                    className={className}
                  >
                    {line.text}
                  </button>
                  {!tapSyncActive && hasLiveSync && (
                    <button
                      type="button"
                      title="Ancorar aqui — alinha a letra a este verso"
                      aria-label="Ancorar sincronização neste verso"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleAnchorLine(line)
                      }}
                      className="shrink-0 rounded-full border border-white/10 bg-white/5 p-1.5 text-[#94A3B8] opacity-0 transition-all group-hover:opacity-100 hover:border-cyan-400/50 hover:text-cyan-300 focus:opacity-100 sm:opacity-0"
                    >
                      <Crosshair className="size-3.5" strokeWidth={ICON_STROKE} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {showManualFallback && (
          <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-2 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Mic2
                className="size-7 text-[#94A3B8]"
                strokeWidth={ICON_STROKE}
              />
            </div>
            <div>
              <h3 className="mb-2 text-xl font-bold text-[#F8FAFC]">
                Letra indisponível
              </h3>
              <p className="text-sm text-[#94A3B8]">
                {error ??
                  'Não encontrámos a letra automaticamente. Ajusta o título/artista e busca no Azuri.'}
              </p>
            </div>

            <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
                Buscador Azuri
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-left">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#94A3B8]">
                    Título
                  </span>
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-cyan-400/50"
                    placeholder="Nome da faixa"
                  />
                </label>
                <label className="block text-left">
                  <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#94A3B8]">
                    Artista
                  </span>
                  <input
                    type="text"
                    value={manualArtist}
                    onChange={(e) => setManualArtist(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-cyan-400/50"
                    placeholder="Artista principal"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void handleManualSearch()}
                disabled={manualSearching}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-bold text-[#080B12] transition-all hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Search className="size-4" strokeWidth={ICON_STROKE} />
                {manualSearching ? 'A buscar…' : 'Buscar no Azuri'}
              </button>

              {manualError && (
                <p className="mt-3 text-sm text-amber-300/90">{manualError}</p>
              )}

              {manualCandidates.length > 0 && (
                <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {manualCandidates.map((candidate) => {
                    const loadingThis = manualLoadingId === candidate.id
                    return (
                      <li key={`${candidate.source}-${candidate.id}`}>
                        <button
                          type="button"
                          onClick={() => void handleSelectCandidate(candidate)}
                          disabled={manualLoadingId != null}
                          className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-left transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/5 disabled:opacity-60"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {candidate.title}
                            </p>
                            <p className="truncate text-xs text-[#94A3B8]">
                              {candidate.artist}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-400">
                                {candidate.source === 'genius'
                                  ? 'Genius'
                                  : 'LRCLIB'}
                              </span>
                              {candidate.hasSynced && (
                                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
                                  Sincronizada
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs font-medium text-cyan-300">
                            {loadingThis ? '…' : 'Usar'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {!showPaste ? (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowPaste(true)}
                  className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-[#F8FAFC] transition-colors hover:border-cyan-400/50 hover:text-cyan-400"
                >
                  Colar letra manualmente
                </button>
                <a
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-[#F8FAFC] transition-colors hover:border-cyan-400/50 hover:text-cyan-400"
                >
                  Pesquisar no Google
                  <ExternalLink
                    className="size-3.5"
                    strokeWidth={ICON_STROKE}
                  />
                </a>
              </div>
            ) : (
              <div className="w-full space-y-3 text-left">
                <label className="block text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
                  Cola a letra (texto simples ou formato LRC)
                </label>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={10}
                  placeholder={
                    '[00:12.00] Primeira linha\n[00:16.50] Segunda linha'
                  }
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-[#F8FAFC] outline-none placeholder:text-[#94A3B8]/60 focus:border-cyan-400/50"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveCustom}
                    disabled={!pasteText.trim()}
                    className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-bold text-gray-900 transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                  >
                    Guardar letra
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPaste(false)}
                    className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-[#94A3B8] hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
