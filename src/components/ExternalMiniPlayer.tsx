import {
  Heart,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  isTrackLiked,
  toggleLikedTrack,
} from '../services/libraryStorage'
import { usePlayerStore } from '../store/usePlayerStore'
import { WaveformProgress } from './WaveformProgress'

const ICON_STROKE = 1.5
const VIDEO_STREAM_BASE = 'http://localhost:3001/api/video/stream'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Origin HTTP real do app (PiP Document usa about:blank → origin inválida). */
function getAppOrigin(): string {
  const fromDataset = document.documentElement.dataset.azuriOrigin
  if (fromDataset && /^https?:\/\//i.test(fromDataset)) return fromDataset
  if (
    typeof window !== 'undefined' &&
    window.location.protocol.startsWith('http')
  ) {
    return window.location.origin
  }
  try {
    const openerOrigin = window.opener?.location?.origin
    if (openerOrigin && /^https?:\/\//i.test(openerOrigin)) return openerOrigin
  } catch {
    // ignore cross-origin
  }
  return 'http://localhost:5173'
}

/** UI do mini-player dentro da janela Document Picture-in-Picture. */
export function ExternalMiniPlayer() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const volume = usePlayerStore((s) => s.volume)
  const isVideoMode = usePlayerStore((s) => s.isVideoMode)
  const currentVideoId = usePlayerStore((s) => s.currentVideoId)
  const seekRequest = usePlayerStore((s) => s.seekRequest)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const handleNextTrack = usePlayerStore((s) => s.handleNextTrack)
  const playPrevious = usePlayerStore((s) => s.playPrevious)
  const setProgress = usePlayerStore((s) => s.setProgress)
  const setDuration = usePlayerStore((s) => s.setDuration)
  const clearSeekRequest = usePlayerStore((s) => s.clearSeekRequest)

  const [liked, setLiked] = useState(false)
  const [nativeFailed, setNativeFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const handoffProgressRef = useRef(progress)
  const videoReadyRef = useRef(false)

  useEffect(() => {
    setLiked(currentTrack ? isTrackLiked(currentTrack.id) : false)
  }, [currentTrack])

  useEffect(() => {
    handoffProgressRef.current = progress
    pendingSeekRef.current = progress > 0 ? progress : null
    videoReadyRef.current = false
    setNativeFailed(false)
  }, [currentVideoId])

  function applyNativeSeek(fraction: number) {
    const el = videoRef.current
    if (!el || !(el.duration > 0)) return false
    el.currentTime = Math.min(
      el.duration,
      Math.max(0, fraction * el.duration),
    )
    return true
  }

  useEffect(() => {
    if (seekRequest == null) return
    pendingSeekRef.current = seekRequest
    if (videoReadyRef.current && applyNativeSeek(seekRequest)) {
      pendingSeekRef.current = null
      clearSeekRequest()
    }
  }, [seekRequest, clearSeekRequest])

  useEffect(() => {
    const el = videoRef.current
    if (!el || nativeFailed) return
    el.volume = Math.min(1, Math.max(0, volume))
  }, [volume, nativeFailed, currentVideoId])

  useEffect(() => {
    const el = videoRef.current
    if (!el || nativeFailed || !videoReadyRef.current) return
    if (isPlaying) {
      void el.play().catch(() => undefined)
    } else {
      el.pause()
    }
  }, [isPlaying, nativeFailed, currentVideoId])

  const title = currentTrack?.name ?? 'Nenhuma música'
  const artist =
    currentTrack?.artists?.map((a) => a.name).join(', ') ?? '—'
  const coverUrl = currentTrack?.album?.images?.[0]?.url
  const elapsed = duration > 0 ? progress * duration : 0

  function handleToggleLike() {
    if (!currentTrack) return
    setLiked(toggleLikedTrack(currentTrack))
  }

  function handleNativeReady() {
    const el = videoRef.current
    if (!el) return
    videoReadyRef.current = true
    if (el.duration > 0) setDuration(el.duration)

    const target =
      pendingSeekRef.current ??
      (handoffProgressRef.current > 0 ? handoffProgressRef.current : null)

    if (target != null && el.duration > 0) {
      applyNativeSeek(target)
      pendingSeekRef.current = null
      clearSeekRequest()
    }

    if (isPlaying) {
      void el.play().catch(() => undefined)
    } else {
      el.pause()
    }
  }

  if (isVideoMode && currentVideoId) {
    const streamSrc = `${VIDEO_STREAM_BASE}?videoId=${encodeURIComponent(currentVideoId)}`
    const startFraction = pendingSeekRef.current ?? progress
    const startSec =
      duration > 0 ? Math.floor(Math.max(0, startFraction) * duration) : 0
    const embedSrc = `${getAppOrigin()}/video-embed?v=${encodeURIComponent(currentVideoId)}&t=${startSec}`

    return (
      <div className="flex h-full min-h-[180px] w-full flex-col overflow-hidden bg-[#070d14] text-[#F8FAFC]">
        <div className="relative min-h-0 flex-1 bg-black">
          {!nativeFailed ? (
            <video
              key={currentVideoId}
              ref={videoRef}
              src={streamSrc}
              className="absolute inset-0 h-full w-full object-contain"
              playsInline
              autoPlay={isPlaying}
              controls={false}
              onLoadedMetadata={handleNativeReady}
              onDurationChange={() => {
                const el = videoRef.current
                if (el && el.duration > 0) {
                  setDuration(el.duration)
                  const target = pendingSeekRef.current
                  if (target != null && applyNativeSeek(target)) {
                    pendingSeekRef.current = null
                    clearSeekRequest()
                  }
                }
              }}
              onTimeUpdate={() => {
                const el = videoRef.current
                if (!el || !(el.duration > 0)) return
                setProgress(el.currentTime / el.duration)
              }}
              onEnded={() => void handleNextTrack()}
              onError={() => {
                videoReadyRef.current = false
                setNativeFailed(true)
              }}
            />
          ) : (
            <iframe
              key={`embed-${currentVideoId}`}
              title={title}
              src={embedSrc}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-cyan-400/15 bg-[#111827]/95 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{title}</p>
            <p className="truncate text-[10px] text-[#94A3B8]">{artist}</p>
          </div>
          <TransportButtons
            isPlaying={isPlaying}
            onPrev={() => void playPrevious()}
            onToggle={togglePlay}
            onNext={() => void handleNextTrack()}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[160px] w-full overflow-hidden bg-[#070d14] text-[#F8FAFC]">
      {/* Fundo atmosférico a partir da capa */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-20 blur-2xl"
          />
        ) : null}
      </div>

      <div className="relative z-10 flex h-full w-full select-none flex-col items-center gap-2 px-3.5 pb-3.5 pt-2.5">
        {/* Capa ocupa toda a altura livre acima do bloco inferior */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className={`aspect-square h-full max-w-full w-auto rounded-2xl border border-cyan-400/30 object-cover shadow-[0_14px_40px_rgba(34,211,238,0.28)] transition-transform duration-500 ${
                isPlaying ? 'scale-[1.03]' : 'scale-100'
              }`}
            />
          ) : (
            <div
              className={`aspect-square h-full max-w-full w-auto rounded-2xl border border-cyan-400/30 bg-white/10 shadow-[0_14px_40px_rgba(34,211,238,0.28)] transition-transform duration-500 ${
                isPlaying ? 'scale-[1.03]' : 'scale-100'
              }`}
            />
          )}
        </div>

        {/* Título, progresso e controles compactos na base */}
        <div className="flex w-full shrink-0 flex-col items-center gap-2">
          <div className="flex w-full min-w-0 flex-col items-center gap-0.5 text-center">
            <div className="flex max-w-full items-center justify-center gap-2">
              <p className="max-w-full truncate text-base font-bold text-slate-50">
                {title}
              </p>
              <button
                type="button"
                onClick={handleToggleLike}
                disabled={!currentTrack}
                aria-label={liked ? 'Remover dos favoritos' : 'Favoritar'}
                className={`shrink-0 rounded-full p-1.5 transition-colors disabled:opacity-40 ${
                  liked
                    ? 'text-cyan-400'
                    : 'text-slate-400 hover:text-slate-50'
                }`}
              >
                <Heart
                  className="size-4"
                  strokeWidth={ICON_STROKE}
                  fill={liked ? 'currentColor' : 'none'}
                />
              </button>
            </div>
            <p className="max-w-full truncate text-xs text-slate-400">
              {artist}
            </p>
          </div>

          <div className="w-full space-y-1">
            {currentTrack ? (
              <WaveformProgress
                trackId={currentTrack.id}
                trackName={currentTrack.name}
                durationMs={
                  currentTrack.duration_ms ??
                  (duration > 0 ? duration * 1000 : 0)
                }
                progress={progress}
                onSeek={seekTo}
                barCount={52}
              />
            ) : (
              <div className="h-8 w-full rounded-lg border border-white/[0.05] bg-white/[0.04]" />
            )}
            <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
              <span>{formatTime(elapsed)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <TransportButtons
              isPlaying={isPlaying}
              onPrev={() => void playPrevious()}
              onToggle={togglePlay}
              onNext={() => void handleNextTrack()}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function TransportButtons({
  isPlaying,
  onPrev,
  onToggle,
  onNext,
}: {
  isPlaying: boolean
  onPrev: () => void
  onToggle: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Faixa anterior"
        className="cursor-pointer rounded-full p-1.5 text-[#94A3B8] transition-transform transition-colors hover:text-white active:scale-90"
      >
        <SkipBack className="size-4" strokeWidth={ICON_STROKE} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
        className="flex size-9 items-center justify-center rounded-full bg-cyan-400 text-[#0B0F19] shadow-[0_0_14px_rgba(34,211,238,0.4)] transition-transform hover:scale-105"
      >
        {isPlaying ? (
          <Pause className="size-4" strokeWidth={ICON_STROKE} fill="currentColor" />
        ) : (
          <Play
            className="size-4 translate-x-px"
            strokeWidth={ICON_STROKE}
            fill="currentColor"
          />
        )}
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Próxima faixa"
        className="rounded-full p-1.5 text-[#94A3B8] transition-colors hover:text-white"
      >
        <SkipForward className="size-4" strokeWidth={ICON_STROKE} />
      </button>
    </div>
  )
}
