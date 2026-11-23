import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Mic2,
  Minus,
  Plus,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  buildExternalLyricsSearchUrl,
  fetchLyrics,
  refreshEstimatedSync,
  saveCustomLrc,
  saveCustomLyrics,
  type LyricLine,
  type LyricsResult,
} from '../services/lyricsService'
import { usePlayerStore } from '../store/usePlayerStore'

const ICON_STROKE = 1.5
const OFFSET_STEP = 0.5

function offsetStorageKey(trackId: string) {
  return `azuri_lyrics_offset_${trackId}`
}

function readSyncOffset(trackId: string): number {
  try {
    const raw = localStorage.getItem(offsetStorageKey(trackId))
    if (raw == null) return 0
    const value = Number(raw)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function writeSyncOffset(trackId: string, offset: number) {
  try {
    if (offset === 0) {
      localStorage.removeItem(offsetStorageKey(trackId))
    } else {
      localStorage.setItem(offsetStorageKey(trackId), String(offset))
    }
  } catch {
    /* ignore quota */
  }
}

function formatOffsetLabel(offset: number): string {
  if (Math.abs(offset) < 0.05) return '0.0s'
  const sign = offset > 0 ? '+' : ''
  return `${sign}${offset.toFixed(1)}s`
}

function findActiveLineIndex(lines: LyricLine[], currentTime: number): number {
  if (lines.length === 0) return -1
  let active = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) active = i
    else break
  }
  return active
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

  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const lastActiveRef = useRef(-1)
  const tapIndexRef = useRef(0)
  const tapSyncActiveRef = useRef(false)
  const tappedLinesRef = useRef<LyricLine[]>([])
  const lyricsRef = useRef<LyricsResult | null>(null)
  const currentTimeRef = useRef(0)
  const trackIdRef = useRef<string | null>(null)
  const lastSmartDurationRef = useRef(0)

  const coverUrl = currentTrack?.album?.images?.[0]?.url
  const title = currentTrack?.name ?? 'Nenhuma música'
  const artistName =
    currentTrack?.artists?.map((a) => a.name).join(', ') ?? ''
  const currentTime = duration > 0 ? progress * duration : 0
  const adjustedTime = currentTime - syncOffset
  const hasLiveSync = Boolean(lyrics?.synced && lyrics.lines.length > 0)
  const isExactSync =
    Boolean(lyrics) &&
    !lyrics!.isEstimated &&
    (lyrics!.source === 'custom-lrc' || lyrics!.source === 'custom')

  // Acompanha currentTime com offset fino por faixa
  const activeLineIndex = tapSyncActive
    ? Math.min(tapIndex, Math.max((lyrics?.lines.length ?? 1) - 1, 0))
    : hasLiveSync
      ? findActiveLineIndex(lyrics!.lines, adjustedTime)
      : -1

  lyricsRef.current = lyrics
  tapIndexRef.current = tapIndex
  tapSyncActiveRef.current = tapSyncActive
  currentTimeRef.current = currentTime
  trackIdRef.current = currentTrack?.id ?? null

  useEffect(() => {
    if (!currentTrack) {
      setLyrics(null)
      setError(null)
      setLoading(false)
      setShowPaste(false)
      setTapSyncActive(false)
      setTapIndex(0)
      setSyncOffset(0)
      tappedLinesRef.current = []
      lastSmartDurationRef.current = 0
      return
    }

    setSyncOffset(readSyncOffset(currentTrack.id))

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setShowPaste(false)
      setPasteText('')
      setLyrics(null)
      setTapSyncActive(false)
      setTapIndex(0)
      tappedLinesRef.current = []
      lastActiveRef.current = -1
      lastSmartDurationRef.current = 0

      const playerDuration = usePlayerStore.getState().duration
      const durationMs =
        currentTrack!.duration_ms ??
        (playerDuration > 0 ? Math.round(playerDuration * 1000) : undefined)

      const result = await fetchLyrics({
        trackId: currentTrack!.id,
        trackName: currentTrack!.name,
        artistName: currentTrack!.artists?.[0]?.name ?? '',
        albumName: currentTrack!.album?.name,
        durationMs,
      })

      if (cancelled) return

      setLyrics(result)
      setLoading(false)
      if (!result) setError('Letra não encontrada')
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [currentTrack?.id])

  useEffect(() => {
    if (duration <= 0) return
    setLyrics((prev) => {
      if (!prev?.isEstimated || !prev.plainText) return prev
      if (Math.abs(duration - lastSmartDurationRef.current) < 0.5) return prev
      lastSmartDurationRef.current = duration
      return refreshEstimatedSync(prev, duration)
    })
  }, [duration, currentTrack?.id])

  // Scroll suave para o verso ativo enquanto a faixa está a tocar
  useEffect(() => {
    if (!isPlaying && !tapSyncActive) return
    if (activeLineIndex < 0 || activeLineIndex === lastActiveRef.current) return
    lastActiveRef.current = activeLineIndex
    lineRefs.current[activeLineIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [activeLineIndex, isPlaying, tapSyncActive])

  function adjustSyncOffset(delta: number) {
    if (!currentTrack) return
    setSyncOffset((prev) => {
      const next = Math.round((prev + delta) * 10) / 10
      writeSyncOffset(currentTrack.id, next)
      lastActiveRef.current = -1
      return next
    })
  }

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
        writeSyncOffset(trackId, 0)
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

  function handleLineClick(line: LyricLine) {
    if (tapSyncActive || !hasLiveSync || duration <= 0) return
    // Compensa o offset: linha T fica ativa quando currentTime = T + syncOffset
    const targetTime = Math.max(0, line.time + syncOffset)
    seekTo(Math.min(1, Math.max(0, targetTime / duration)))
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
    const saved = saveCustomLyrics(
      currentTrack.id,
      pasteText,
      duration > 0 ? duration : undefined,
    )
    setLyrics(saved)
    setShowPaste(false)
    setError(saved ? null : 'Letra não encontrada')
    lastActiveRef.current = -1
  }

  const searchUrl = buildExternalLyricsSearchUrl(title, artistName)
  const showSyncToolbar = Boolean(lyrics && hasLiveSync && !tapSyncActive)

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-[#0B0F19]">
      {coverUrl && (
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-30 blur-3xl"
          style={{ backgroundImage: `url(${coverUrl})` }}
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-[#0B0F19]/85 backdrop-blur-xl" />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/5 px-4 py-4 md:px-8">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md object-cover shadow-lg"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white/10">
              <Mic2 className="size-5 text-[#94A3B8]" strokeWidth={ICON_STROKE} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-[#F8FAFC] md:text-lg">
              {title}
            </h2>
            <p className="truncate text-sm text-[#94A3B8]">{artistName || '—'}</p>
          </div>

          <button
            type="button"
            onClick={closeLyrics}
            title="Fechar letras"
            aria-label="Fechar letras"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#94A3B8] transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronDown className="size-6" strokeWidth={ICON_STROKE} />
          </button>
        </header>

        {showSyncToolbar && (
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2.5 md:px-8">
            {isExactSync ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-300">
                <CheckCircle2
                  className="size-3.5 text-cyan-400"
                  strokeWidth={ICON_STROKE}
                />
                Sincronização salva (Exata)
              </span>
            ) : lyrics?.isEstimated ? (
              <>
                <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-300">
                  Sincronização inteligente ativa
                </span>
                <button
                  type="button"
                  onClick={startTapSync}
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-[#F8FAFC] transition-colors hover:border-cyan-400/50 hover:text-cyan-400"
                >
                  Ajustar tempo (Tap Sync)
                </button>
              </>
            ) : (
              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-300">
                Letra sincronizada
              </span>
            )}

            {/* Ajuste fino de offset por música */}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-300">
              <button
                type="button"
                onClick={() => adjustSyncOffset(-OFFSET_STEP)}
                title="Adiantar letra (−0.5s)"
                aria-label="Adiantar letra 0.5 segundos"
                className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-cyan-400"
              >
                <Minus className="size-3" strokeWidth={ICON_STROKE} />
                0.5s
              </button>
              <span
                className={`min-w-[3.25rem] text-center font-mono tabular-nums ${
                  syncOffset === 0 ? 'text-gray-400' : 'text-cyan-400'
                }`}
                title="Deslocamento da letra"
              >
                {formatOffsetLabel(syncOffset)}
              </span>
              <button
                type="button"
                onClick={() => adjustSyncOffset(OFFSET_STEP)}
                title="Atrasar letra (+0.5s)"
                aria-label="Atrasar letra 0.5 segundos"
                className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/10 hover:text-cyan-400"
              >
                <Plus className="size-3" strokeWidth={ICON_STROKE} />
                0.5s
              </button>
            </div>
          </div>
        )}

        {tapSyncActive && lyrics && (
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-3 border-b border-cyan-400/20 bg-cyan-400/5 px-4 py-3 md:px-8">
            <p className="text-sm text-[#F8FAFC]">
              Marca o verso{' '}
              <span className="font-bold text-cyan-400">
                {Math.min(tapIndex + 1, lyrics.lines.length)}/
                {lyrics.lines.length}
              </span>{' '}
              no ritmo da música
              <span className="text-[#94A3B8]"> · Espaço</span>
            </p>
            <button
              type="button"
              onClick={markTapAtCurrentTime}
              className="rounded-full bg-cyan-400 px-4 py-1.5 text-sm font-bold text-gray-900 transition-transform hover:scale-105"
            >
              Marcar verso atual
            </button>
            <button
              type="button"
              onClick={cancelTapSync}
              className="rounded-full border border-white/15 px-3 py-1.5 text-sm text-[#94A3B8] hover:text-white"
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto py-10 md:py-14">
          {!currentTrack && (
            <p className="px-8 text-center text-lg text-[#94A3B8] md:px-16">
              Reproduza uma faixa para ver a letra.
            </p>
          )}

          {currentTrack && loading && (
            <p className="px-8 text-center text-lg text-cyan-400 md:px-16">
              A procurar letra…
            </p>
          )}

          {currentTrack && !loading && lyrics && (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-8 md:gap-6 md:px-16">
              {lyrics.lines.map((line, index) => {
                const isActive = index === activeLineIndex && !tapSyncActive
                const isPendingTap = tapSyncActive && index === tapIndex
                const isTapped = tapSyncActive && index < tapIndex

                // Tipografia estável: mesmo tamanho; destaque só por cor/opacidade
                const className =
                  isActive || isPendingTap
                    ? 'cursor-pointer text-left text-2xl font-bold leading-relaxed text-cyan-400 opacity-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)] transition-all duration-300 md:text-3xl'
                    : isTapped
                      ? 'cursor-pointer text-left text-2xl font-bold leading-relaxed text-white/50 transition-all duration-300 md:text-3xl'
                      : 'cursor-pointer text-left text-2xl font-bold leading-relaxed text-white/30 transition-all duration-300 hover:text-white/70 md:text-3xl'

                return (
                  <button
                    key={`${line.text}-${index}`}
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
                )
              })}
            </div>
          )}

          {currentTrack && !loading && !lyrics && (
            <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-8 text-center md:px-16">
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
                    'Não encontrámos a letra desta faixa. Podes colar uma letra manualmente ou pesquisar online.'}
                </p>
              </div>

              {!showPaste ? (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPaste(true)}
                    className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-bold text-gray-900 transition-transform hover:scale-105"
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
    </div>
  )
}
