import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { usePlayerStore } from '../store/usePlayerStore'
import { generateTrackWaveform } from '../utils/waveformGenerator'

type TrackWaveformProps = {
  trackId: string
  trackName: string
  durationMs?: number
  barCount?: number
  /** Altura do container em classes Tailwind */
  className?: string
  barClassName?: string
  /** compact = barras finas em px (álbum); featured = % da altura */
  variant?: 'featured' | 'compact' | 'player' | 'album'
  interactiveSeek?: boolean
  onBarClick?: (fraction: number) => void
}

export function TrackWaveform({
  trackId,
  trackName,
  durationMs = 0,
  barCount = 65,
  className = '',
  barClassName = '',
  variant = 'featured',
  interactiveSeek = true,
  onBarClick,
}: TrackWaveformProps) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const progress = usePlayerStore((s) => s.progress)
  const seekTo = usePlayerStore((s) => s.seekTo)

  const isCurrent = currentTrack?.id === trackId
  const isActive = isCurrent && isPlaying
  const canSeek = interactiveSeek && (isCurrent || Boolean(onBarClick))

  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const bars = useMemo(
    () => generateTrackWaveform(trackId, trackName, durationMs, barCount),
    [trackId, trackName, durationMs, barCount],
  )

  const [pulseMap, setPulseMap] = useState<Record<number, number>>({})

  /** Progresso 0–100, limitado às extremidades */
  const progressPct =
    isCurrent && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress * 100))
      : 0

  useEffect(() => {
    if (!isActive) {
      setPulseMap({})
      return
    }

    const tick = () => {
      const currentProgress = usePlayerStore.getState().progress
      const playhead = Math.floor(currentProgress * bars.length)
      const next: Record<number, number> = {}
      for (let i = 0; i < bars.length; i++) {
        const distance = Math.abs(i - playhead)
        if (i <= playhead && distance <= 6) {
          const intensity = 1 - distance / 7
          next[i] = 0.82 + Math.random() * 0.38 * intensity
        }
      }
      setPulseMap(next)
    }

    tick()
    const id = window.setInterval(tick, 120)
    return () => window.clearInterval(id)
  }, [isActive, bars.length])

  function fractionFromClientX(clientX: number) {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  function applySeek(fraction: number) {
    onBarClick?.(fraction)
    if (isCurrent) seekTo(fraction)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canSeek) return
    event.preventDefault()
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    applySeek(fractionFromClientX(event.clientX))
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canSeek || !draggingRef.current) return
    applySeek(fractionFromClientX(event.clientX))
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
      className={`flex h-full w-full items-end justify-between gap-[2px] overflow-hidden ${
        canSeek ? 'cursor-pointer' : ''
      } ${className}`}
      role={isCurrent && interactiveSeek ? 'slider' : undefined}
      aria-label={isCurrent ? 'Waveform — clique para procurar' : undefined}
      aria-valuemin={isCurrent ? 0 : undefined}
      aria-valuemax={isCurrent ? 100 : undefined}
      aria-valuenow={isCurrent ? Math.round(progressPct) : undefined}
      onPointerDown={canSeek ? handlePointerDown : undefined}
      onPointerMove={canSeek ? handlePointerMove : undefined}
      onPointerUp={canSeek ? handlePointerUp : undefined}
      onPointerCancel={canSeek ? handlePointerUp : undefined}
    >
      {bars.map((baseHeight, index) => {
        const pulse = pulseMap[index] ?? 1
        const heightPct = Math.min(100, Math.max(15, baseHeight * pulse))
        const barThreshold = ((index + 1) / bars.length) * 100
        const isPlayed =
          isCurrent && (barThreshold <= progressPct || progressPct >= 99.5)
        const playheadIndex = Math.min(
          bars.length - 1,
          Math.floor((progressPct / 100) * bars.length),
        )
        const isNearPlayhead =
          isActive && Math.abs(index - playheadIndex) <= 2

        let heightStyle: CSSProperties
        if (variant === 'compact') {
          heightStyle = {
            height: `${Math.min(16, (heightPct / 100) * 16)}px`,
            maxHeight: '16px',
            transformOrigin: 'bottom',
            transform: isNearPlayhead ? `scaleY(${pulse})` : undefined,
            transition:
              'height 100ms linear, transform 100ms linear, background-color 200ms',
          }
        } else {
          heightStyle = {
            height: `${heightPct}%`,
            transformOrigin: 'bottom',
            transform: isNearPlayhead
              ? `scaleY(${Math.min(1.15, pulse)})`
              : undefined,
            transition:
              'height 100ms linear, transform 100ms linear, background-color 200ms, opacity 200ms',
          }
        }

        const colorClass =
          isPlayed || isActive
            ? isNearPlayhead || progressPct >= 99.5
              ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.45)]'
              : 'bg-gradient-to-t from-cyan-600 to-cyan-400'
            : variant === 'album'
              ? 'bg-gray-600 hover:bg-cyan-400'
              : 'bg-gray-700 group-hover:bg-gradient-to-t group-hover:from-cyan-600 group-hover:to-cyan-400'

        const opacity = isPlayed
          ? 1
          : isCurrent
            ? 0.35
            : variant === 'compact'
              ? index < 12
                ? 1
                : 0.45
              : index / bars.length < 0.25
                ? 1
                : 0.4

        return (
          <div
            key={index}
            aria-hidden
            className={`min-w-[2px] flex-1 rounded-full ${colorClass} ${barClassName}`}
            style={{ ...heightStyle, opacity }}
          />
        )
      })}
    </div>
  )
}
