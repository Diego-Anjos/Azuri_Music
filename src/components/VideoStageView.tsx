import {
  Clapperboard,
  Expand,
  GripHorizontal,
  Loader2,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  RefreshCw,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import ReactPlayer from 'react-player/youtube'
import { LyricsView } from './LyricsView'
import { useExternalPiP } from '../hooks/useExternalPiP'
import { extractYoutubeVideoId } from '../services/videoService'
import {
  usePlayerStore,
  type VideoDisplayMode,
} from '../store/usePlayerStore'

const ICON_STROKE = 1.5
const PIP_POS_KEY = 'azuri_pip_pos'
const PIP_WIDTH = 320
const PIP_CARD_HEIGHT_EST = 260

type PipPos = { x: number; y: number }

function playerBottomClearance(): number {
  // Barra do player (+ nav mobile)
  return window.matchMedia('(min-width: 768px)').matches ? 96 : 128
}

function defaultPipPos(): PipPos {
  const margin = 12
  return {
    x: Math.max(margin, window.innerWidth - PIP_WIDTH - margin),
    y: Math.max(
      margin,
      window.innerHeight - PIP_CARD_HEIGHT_EST - playerBottomClearance(),
    ),
  }
}

function clampPipPos(pos: PipPos, width: number, height: number): PipPos {
  const margin = 8
  const maxX = Math.max(margin, window.innerWidth - width - margin)
  const maxY = Math.max(
    margin,
    window.innerHeight - height - playerBottomClearance(),
  )
  return {
    x: Math.min(maxX, Math.max(margin, pos.x)),
    y: Math.min(maxY, Math.max(margin, pos.y)),
  }
}

function readPipPos(): PipPos {
  try {
    const raw = localStorage.getItem(PIP_POS_KEY)
    if (!raw) return defaultPipPos()
    const parsed = JSON.parse(raw) as Partial<PipPos>
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) {
      return defaultPipPos()
    }
    return clampPipPos(
      { x: parsed.x, y: parsed.y },
      PIP_WIDTH,
      PIP_CARD_HEIGHT_EST,
    )
  } catch {
    return defaultPipPos()
  }
}

function writePipPos(pos: PipPos) {
  try {
    localStorage.setItem(PIP_POS_KEY, JSON.stringify(pos))
  } catch {
    // ignore
  }
}

const MODE_OPTIONS: Array<{
  id: VideoDisplayMode
  label: string
  short: string
}> = [
  { id: 'stage', label: 'Clipe', short: 'Clipe' },
  { id: 'split-lyrics', label: 'Clipe + Letra', short: 'Letra' },
  { id: 'pip', label: 'Minimizar (PiP)', short: 'PiP' },
]

const DECOR_NOTES = [
  { symbol: '♪', className: 'left-[6%] top-[18%] text-cyan-400/70 text-3xl', delay: '0s' },
  { symbol: '♫', className: 'right-[8%] top-[22%] text-violet-300/60 text-4xl', delay: '0.4s' },
  { symbol: '♬', className: 'left-[10%] bottom-[28%] text-cyan-300/50 text-2xl', delay: '0.8s' },
  { symbol: '𝄞', className: 'right-[12%] bottom-[24%] text-violet-400/50 text-5xl', delay: '1.1s' },
  { symbol: '♩', className: 'left-[48%] top-[10%] text-cyan-400/40 text-2xl', delay: '0.2s' },
  { symbol: '♪', className: 'right-[40%] bottom-[12%] text-cyan-300/45 text-xl', delay: '1.4s' },
] as const

function MusicalDecor({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {DECOR_NOTES.map((note, index) => (
        <span
          key={`${note.symbol}-${index}`}
          className={`absolute select-none font-serif ${note.className} ${
            isPlaying ? 'azuri-note-float-a' : 'opacity-40'
          }`}
          style={{
            animationDelay: note.delay,
            animationDuration: isPlaying ? '3.6s' : undefined,
          }}
        >
          {note.symbol}
        </span>
      ))}
      {/* Ondas sonoras estilizadas */}
      <div
        className={`absolute left-[4%] top-1/2 flex -translate-y-1/2 gap-1 ${
          isPlaying ? 'azuri-wave-pulse' : 'opacity-30'
        }`}
      >
        {[10, 16, 22, 14, 20].map((h, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-cyan-400/50"
            style={{ height: h, animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <div
        className={`absolute right-[4%] top-1/2 flex -translate-y-1/2 gap-1 ${
          isPlaying ? 'azuri-wave-pulse' : 'opacity-30'
        }`}
      >
        {[14, 22, 12, 18, 10].map((h, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-violet-400/45"
            style={{ height: h, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

function StageChrome({
  compact,
  onDragPointerDown,
  onHeaderDoubleClick,
}: {
  compact?: boolean
  onDragPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
  onHeaderDoubleClick?: () => void
}) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const videoDisplayMode = usePlayerStore((s) => s.videoDisplayMode)
  const setVideoDisplayMode = usePlayerStore((s) => s.setVideoDisplayMode)
  const setVideoMode = usePlayerStore((s) => s.setVideoMode)
  const currentVideoId = usePlayerStore((s) => s.currentVideoId)
  const isOfficialClip = usePlayerStore((s) => s.isOfficialClip)
  const videoAlternatives = usePlayerStore((s) => s.videoAlternatives)
  const selectVideoClip = usePlayerStore((s) => s.selectVideoClip)
  const {
    isOpen: isExternalPipOpen,
    isSupported: isExternalPipSupported,
    toggle: toggleExternalPip,
  } = useExternalPiP()

  const [swapOpen, setSwapOpen] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const swapRef = useRef<HTMLDivElement | null>(null)

  const title = currentTrack?.name ?? 'Nenhuma música'
  const artist =
    currentTrack?.artists?.map((a) => a.name).join(', ') ?? '—'
  const coverUrl = currentTrack?.album?.images?.[0]?.url

  useEffect(() => {
    if (!swapOpen) return
    function handlePointer(event: MouseEvent) {
      if (!swapRef.current?.contains(event.target as Node)) {
        setSwapOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSwapOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [swapOpen])

  useEffect(() => {
    setSwapOpen(false)
    setManualUrl('')
    setManualError(null)
  }, [currentTrack?.id])

  function handlePinManualUrl() {
    const videoId = extractYoutubeVideoId(manualUrl)
    if (!videoId) {
      setManualError('Cole um link válido do YouTube.')
      return
    }
    selectVideoClip(videoId, { pin: true, isOfficialClip: true })
    setManualUrl('')
    setManualError(null)
    setSwapOpen(false)
  }

  return (
    <header
      onPointerDown={compact ? onDragPointerDown : undefined}
      onDoubleClick={compact ? onHeaderDoubleClick : undefined}
      className={`relative z-20 flex flex-wrap items-center gap-3 border-b border-cyan-400/15 ${
        compact
          ? 'cursor-grab select-none px-3 py-2 active:cursor-grabbing'
          : 'px-4 py-3 sm:px-6'
      }`}
      title={compact ? 'Arraste para mover · duplo clique para resetar' : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {compact && (
          <GripHorizontal
            className="size-4 shrink-0 text-[#94A3B8]/80"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
        )}
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="pointer-events-none h-10 w-10 shrink-0 rounded-lg object-cover shadow-lg sm:h-11 sm:w-11"
            draggable={false}
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 sm:h-11 sm:w-11">
            <Clapperboard
              className="size-5 text-cyan-400"
              strokeWidth={ICON_STROKE}
            />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            {currentVideoId && !compact && (
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                  isOfficialClip
                    ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
                    : 'border-white/15 bg-white/5 text-[#94A3B8]'
                }`}
                title={
                  isOfficialClip
                    ? 'Videoclipe oficial encontrado'
                    : 'Sem clipe disponível — versão áudio/capa'
                }
              >
                {isOfficialClip ? 'Clipe Oficial' : 'Versão Áudio / Capa'}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-[#94A3B8]">{artist}</p>
        </div>
      </div>

      {!compact && (
        <div className="order-3 flex w-full justify-center sm:order-none sm:w-auto">
          <div className="inline-flex rounded-full border border-cyan-400/25 bg-black/40 p-1 backdrop-blur-md">
            {MODE_OPTIONS.map((option) => {
              const active = videoDisplayMode === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setVideoDisplayMode(option.id)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all sm:px-3.5 sm:text-xs ${
                    active
                      ? 'bg-cyan-400 text-[#0B0F19] shadow-[0_0_16px_rgba(34,211,238,0.45)]'
                      : 'text-[#94A3B8] hover:text-cyan-300'
                  }`}
                >
                  <span className="sm:hidden">{option.short}</span>
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="relative flex shrink-0 items-center gap-2" ref={swapRef}>
        {!compact && currentVideoId && (
          <>
            <button
              type="button"
              onClick={() => setSwapOpen((open) => !open)}
              title="Trocar clipe"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-[11px] font-medium whitespace-nowrap text-[#94A3B8] transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
            >
              <RefreshCw className="size-3" strokeWidth={ICON_STROKE} />
              Trocar clipe
            </button>

            {swapOpen && (
              <div className="absolute top-full right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-cyan-400/20 bg-[#0B0F19]/98 p-3 shadow-[0_0_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                <p className="mb-2 text-[11px] font-semibold tracking-wide text-[#94A3B8] uppercase">
                  Alternativas
                </p>
                {videoAlternatives.length > 0 ? (
                  <ul className="mb-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {videoAlternatives.map((alt) => {
                      const active = alt.videoId === currentVideoId
                      return (
                        <li key={alt.videoId}>
                          <button
                            type="button"
                            disabled={active}
                            onClick={() => {
                              selectVideoClip(alt.videoId, {
                                pin: true,
                                isOfficialClip: alt.isOfficialClip,
                              })
                              setSwapOpen(false)
                            }}
                            className="flex w-full items-start gap-2.5 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2 text-left transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/5 disabled:opacity-50"
                          >
                            <img
                              src={alt.thumbnail}
                              alt=""
                              className="h-10 w-16 shrink-0 rounded-md object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-white">
                                {alt.title}
                              </p>
                              <p className="truncate text-[10px] text-[#94A3B8]">
                                {alt.channel || 'YouTube'}
                                {alt.isOfficialClip
                                  ? ' · Clipe'
                                  : ' · Áudio/Capa'}
                              </p>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="mb-3 text-xs text-[#94A3B8]">
                    Sem alternativas na busca. Cole um link abaixo.
                  </p>
                )}

                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-[#94A3B8]">
                    Colar link do YouTube
                  </span>
                  <input
                    type="url"
                    value={manualUrl}
                    onChange={(e) => {
                      setManualUrl(e.target.value)
                      setManualError(null)
                    }}
                    placeholder="https://www.youtube.com/watch?v=…"
                    className="w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-600 focus:border-cyan-400/50"
                  />
                </label>
                {manualError && (
                  <p className="mt-1.5 text-[11px] text-amber-300/90">
                    {manualError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handlePinManualUrl}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold text-[#080B12] transition-colors hover:bg-cyan-300"
                >
                  Fixar este clipe
                </button>
              </div>
            )}
          </>
        )}

        {compact && isExternalPipSupported && (
          <button
            type="button"
            onClick={() => void toggleExternalPip()}
            title="Janela Flutuante (Fora do Navegador)"
            aria-label="Janela Flutuante (Fora do Navegador)"
            aria-pressed={isExternalPipOpen}
            className={`rounded-full border p-2 transition-colors ${
              isExternalPipOpen
                ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
                : 'border-white/10 bg-white/5 text-[#94A3B8] hover:border-cyan-400/40 hover:text-cyan-300'
            }`}
          >
            <PictureInPicture2 className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        )}
        {compact && (
          <button
            type="button"
            onClick={() => setVideoDisplayMode('stage')}
            title="Expandir palco"
            aria-label="Expandir palco"
            className="rounded-full border border-cyan-400/30 bg-cyan-400/10 p-2 text-cyan-300 transition-colors hover:bg-cyan-400/20"
          >
            <Expand className="size-4" strokeWidth={ICON_STROKE} />
          </button>
        )}
        <button
          type="button"
          onClick={() => void setVideoMode(false)}
          title="Fechar Vídeo"
          aria-label="Fechar Vídeo"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-white transition-all hover:border-cyan-400/50 hover:bg-cyan-500/20 hover:text-cyan-300"
        >
          <X className="size-4" strokeWidth={ICON_STROKE} />
          {!compact && (
            <span className="text-xs font-semibold">Fechar Vídeo</span>
          )}
        </button>
      </div>
    </header>
  )
}

function VideoFrame({
  mode,
}: {
  mode: VideoDisplayMode
}) {
  const playerRef = useRef<ReactPlayer | null>(null)
  const currentVideoId = usePlayerStore((s) => s.currentVideoId)
  const isLoadingVideo = usePlayerStore((s) => s.isLoadingVideo)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const progress = usePlayerStore((s) => s.progress)
  const seekRequest = usePlayerStore((s) => s.seekRequest)
  const setProgress = usePlayerStore((s) => s.setProgress)
  const setDuration = usePlayerStore((s) => s.setDuration)
  const clearSeekRequest = usePlayerStore((s) => s.clearSeekRequest)
  const handleNextTrack = usePlayerStore((s) => s.handleNextTrack)
  const { isOpen: isExternalPipOpen, mode: externalPipMode } = useExternalPiP()
  const handedOffToExternal =
    isExternalPipOpen && externalPipMode === 'document'
  const [ready, setReady] = useState(false)
  const pendingSeekRef = useRef<number | null>(null)

  function tryApplyPendingSeek() {
    const target = pendingSeekRef.current
    const player = playerRef.current
    if (target == null || !player) return
    const dur = player.getDuration()
    if (!(dur > 0)) return
    player.seekTo(target, 'fraction')
    pendingSeekRef.current = null
    clearSeekRequest()
  }

  useEffect(() => {
    setReady(false)
    pendingSeekRef.current = progress
  }, [currentVideoId])

  useEffect(() => {
    if (seekRequest == null) return
    pendingSeekRef.current = seekRequest
    if (ready) tryApplyPendingSeek()
  }, [seekRequest, ready, clearSeekRequest])

  function handleReady() {
    setReady(true)
    tryApplyPendingSeek()
  }

  function handleDuration(dur: number) {
    setDuration(dur)
    if (dur > 0) tryApplyPendingSeek()
  }

  const isPip = mode === 'pip'
  const aspect = isPip ? 'aspect-video w-full' : 'aspect-video w-full'

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-cyan-400/25 bg-black/60 shadow-[0_0_50px_rgba(34,211,238,0.12)] ${aspect}`}
    >
      {isLoadingVideo && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#070d14]/90">
          <Loader2
            className="size-8 animate-spin text-cyan-400"
            strokeWidth={ICON_STROKE}
          />
          <p className="text-xs text-cyan-200/80">Buscando videoclipe…</p>
        </div>
      )}

      {!isLoadingVideo && !currentVideoId && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#070d14]/90 px-4 text-center">
          <p className="text-sm text-[#94A3B8]">
            Nenhum videoclipe oficial encontrado para esta faixa.
          </p>
        </div>
      )}

      {handedOffToExternal && currentVideoId && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#070d14]/92 px-4 text-center">
          <PictureInPicture2
            className="size-7 text-cyan-400"
            strokeWidth={ICON_STROKE}
          />
          <p className="text-xs text-cyan-200/90">
            Reproduzindo na janela flutuante
          </p>
        </div>
      )}

      {currentVideoId && !handedOffToExternal && (
        <ReactPlayer
          ref={playerRef}
          url={`https://www.youtube.com/watch?v=${currentVideoId}`}
          playing={isPlaying}
          volume={volume}
          width="100%"
          height="100%"
          className="absolute inset-0"
          controls={!isPip}
          progressInterval={200}
          onReady={handleReady}
          onProgress={(state) => setProgress(state.played)}
          onDuration={handleDuration}
          onEnded={() => void handleNextTrack()}
        />
      )}
    </div>
  )
}

function DraggablePipCard() {
  const setVideoDisplayMode = usePlayerStore((s) => s.setVideoDisplayMode)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<PipPos>(() => readPipPos())
  const posRef = useRef(pos)
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
  } | null>(null)

  useEffect(() => {
    posRef.current = pos
  }, [pos])

  const resetPosition = useCallback(() => {
    const next = defaultPipPos()
    setPos(next)
    writePipPos(next)
  }, [])

  useEffect(() => {
    function onResize() {
      setPos((prev) => {
        const el = cardRef.current
        const width = el?.offsetWidth ?? PIP_WIDTH
        const height = el?.offsetHeight ?? PIP_CARD_HEIGHT_EST
        const next = clampPipPos(prev, width, height)
        writePipPos(next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function handleDragPointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, input, textarea, select, label')) {
      return
    }

    const card = cardRef.current
    if (!card) return

    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - posRef.current.x,
      offsetY: event.clientY - posRef.current.y,
    }
    card.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const card = cardRef.current
    const width = card?.offsetWidth ?? PIP_WIDTH
    const height = card?.offsetHeight ?? PIP_CARD_HEIGHT_EST
    const next = clampPipPos(
      {
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY,
      },
      width,
      height,
    )
    posRef.current = next
    setPos(next)
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    writePipPos(posRef.current)
    try {
      cardRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ left: pos.x, top: pos.y, width: `min(100vw - 1.5rem, ${PIP_WIDTH}px)` }}
      className="fixed z-50 overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#070d14]/95 shadow-[0_0_40px_rgba(34,211,238,0.18)] backdrop-blur-xl"
    >
      <StageChrome
        compact
        onDragPointerDown={handleDragPointerDown}
        onHeaderDoubleClick={resetPosition}
      />
      <div className="p-2">
        <VideoFrame mode="pip" />
      </div>
      <div className="flex justify-end gap-2 border-t border-white/5 px-2 py-1.5">
        <button
          type="button"
          onClick={resetPosition}
          title="Resetar posição"
          className="mr-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-[#94A3B8] transition-colors hover:text-cyan-300"
        >
          <GripHorizontal className="size-3.5" strokeWidth={ICON_STROKE} />
          Resetar
        </button>
        <button
          type="button"
          onClick={() => setVideoDisplayMode('split-lyrics')}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-[#94A3B8] transition-colors hover:text-cyan-300"
        >
          <Maximize2 className="size-3.5" strokeWidth={ICON_STROKE} />
          + Letra
        </button>
        <button
          type="button"
          onClick={() => setVideoDisplayMode('stage')}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-cyan-300 transition-colors hover:text-cyan-200"
        >
          <Expand className="size-3.5" strokeWidth={ICON_STROKE} />
          Expandir
        </button>
      </div>
    </div>
  )
}

export function VideoStageView() {
  const isVideoMode = usePlayerStore((s) => s.isVideoMode)
  const videoDisplayMode = usePlayerStore((s) => s.videoDisplayMode)
  const setVideoDisplayMode = usePlayerStore((s) => s.setVideoDisplayMode)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const { isOpen: isExternalPipOpen } = useExternalPiP()

  if (!isVideoMode) return null

  // Evita dois mini-players / dois vídeos quando a janela externa está aberta
  if (videoDisplayMode === 'pip') {
    if (isExternalPipOpen) return null
    return <DraggablePipCard />
  }

  const isSplit = videoDisplayMode === 'split-lyrics'

  return (
    <div className="fixed top-0 right-0 bottom-30 left-0 z-40 flex flex-col overflow-hidden bg-[#070d14]/92 backdrop-blur-2xl md:left-60 md:bottom-20 lg:left-64">
      <MusicalDecor isPlaying={isPlaying} />
      <StageChrome />

      <div className="relative z-10 flex min-h-0 flex-1 items-stretch justify-center overflow-y-auto p-3 sm:p-5 md:p-6">
        <div
          className={`w-full ${
            isSplit
              ? 'grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-12'
              : 'mx-auto max-w-5xl'
          }`}
        >
          <div
            className={`relative rounded-2xl border border-cyan-400/25 bg-[#070d14]/90 p-3 shadow-[0_0_50px_rgba(34,211,238,0.12)] backdrop-blur-xl sm:p-4 ${
              isSplit ? 'lg:col-span-7' : ''
            }`}
          >
            <MusicalDecor isPlaying={isPlaying} />
            <div className="relative z-10">
              <VideoFrame mode={videoDisplayMode} />
            </div>
          </div>

          {isSplit && (
            <div className="min-h-[320px] overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#070d14]/90 shadow-[0_0_40px_rgba(34,211,238,0.1)] backdrop-blur-xl lg:col-span-5 lg:min-h-0">
              <LyricsView embedded />
            </div>
          )}
        </div>
      </div>

      {videoDisplayMode === 'stage' && (
        <div className="relative z-20 flex justify-center pb-3">
          <button
            type="button"
            onClick={() => setVideoDisplayMode('pip')}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[#94A3B8] transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
          >
            <Minimize2 className="size-3.5" strokeWidth={ICON_STROKE} />
            Minimizar para PiP
          </button>
        </div>
      )}
    </div>
  )
}
