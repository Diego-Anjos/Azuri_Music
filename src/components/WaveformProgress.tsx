import {
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { generateTrackWaveform } from '../utils/waveformGenerator'

type WaveformProgressProps = {
  trackId: string
  trackName: string
  durationMs?: number
  /** Progresso normalizado 0–1 */
  progress: number
  onSeek: (fraction: number) => void
  /** Quantidade de barras (48–56 ideal para ~350px) */
  barCount?: number
  className?: string
}

/**
 * Barra de progresso em ondas, idêntica à assinatura do player principal
 * (mesmo gerador determinístico por track.id / track.name).
 * Seek via pointer capture — compatível com Document Picture-in-Picture.
 */
export function WaveformProgress({
  trackId,
  trackName,
  durationMs = 0,
  progress,
  onSeek,
  barCount = 52,
  className = '',
}: WaveformProgressProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const bars = useMemo(
    () => generateTrackWaveform(trackId, trackName, durationMs, barCount),
    [trackId, trackName, durationMs, barCount],
  )

  const progressPct = Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress * 100))
    : 0

  function fractionFromClientX(clientX: number) {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    onSeek(fractionFromClientX(event.clientX))
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    onSeek(fractionFromClientX(event.clientX))
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label="Progresso — clique ou arraste para procurar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressPct)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative h-8 w-full cursor-pointer select-none overflow-hidden rounded-lg border border-white/[0.05] bg-white/[0.04] ${className}`}
    >
      {/* Camada base: faixa ainda não reproduzida */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center gap-[2px] px-2 py-1.5"
        aria-hidden
      >
        {bars.map((height, index) => (
          <div
            key={`base-${index}`}
            className="min-w-[2px] flex-1 rounded-full bg-white/15"
            style={{ height: `${Math.min(100, Math.max(18, height))}%` }}
          />
        ))}
      </div>

      {/* Camada ciano: clipPath proporcional ao progresso (suave em 60fps) */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center gap-[2px] px-2 py-1.5 will-change-[clip-path]"
        style={{
          clipPath: `inset(0 ${100 - progressPct}% 0 0)`,
        }}
        aria-hidden
      >
        {bars.map((height, index) => (
          <div
            key={`played-${index}`}
            className="min-w-[2px] flex-1 rounded-full bg-[#22d3ee] shadow-[0_0_6px_rgba(34,211,238,0.35)]"
            style={{ height: `${Math.min(100, Math.max(18, height))}%` }}
          />
        ))}
      </div>
    </div>
  )
}
