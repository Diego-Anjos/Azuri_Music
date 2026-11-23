import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
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

  const bars = useMemo(
    () => generateTrackWaveform(trackId, trackName, durationMs, barCount),
    [trackId, trackName, durationMs, barCount],
  )

  const [pulseMap, setPulseMap] = useState<Record<number, number>>({})

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
          // Oscilação forte perto do cursor; leve nas barras já tocadas recentes
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

  function handleBarClick(event: MouseEvent, index: number) {
    event.stopPropagation()
    if (!interactiveSeek) return
    if (!isCurrent && !onBarClick) return

    const fraction = bars.length <= 1 ? 0 : index / (bars.length - 1)
    onBarClick?.(fraction)
    if (isCurrent) seekTo(fraction)
  }

  const playheadIndex = isCurrent
    ? Math.min(bars.length - 1, Math.floor(progress * bars.length))
    : -1

  return (
    <div
      className={`flex w-full items-end gap-[2px] overflow-hidden ${className}`}
      role={isCurrent && interactiveSeek ? 'slider' : undefined}
      aria-label={isCurrent ? 'Waveform — clique para procurar' : undefined}
      aria-valuemin={isCurrent ? 0 : undefined}
      aria-valuemax={isCurrent ? 100 : undefined}
      aria-valuenow={isCurrent ? Math.round(progress * 100) : undefined}
    >
      {bars.map((baseHeight, index) => {
        const pulse = pulseMap[index] ?? 1
        const heightPct = Math.min(100, Math.max(15, baseHeight * pulse))
        const isPlayed = isCurrent && index <= playheadIndex
        const isNearPlayhead =
          isActive && Math.abs(index - playheadIndex) <= 2

        let heightStyle: CSSProperties
        if (variant === 'compact') {
          heightStyle = {
            height: `${Math.min(16, (heightPct / 100) * 16)}px`,
            maxHeight: '16px',
            transformOrigin: 'bottom',
            transform: isNearPlayhead ? `scaleY(${pulse})` : undefined,
            transition: 'height 100ms linear, transform 100ms linear, background-color 200ms',
          }
        } else {
          heightStyle = {
            height: `${heightPct}%`,
            transformOrigin: 'bottom',
            transform: isNearPlayhead ? `scaleY(${Math.min(1.15, pulse)})` : undefined,
            transition: 'height 100ms linear, transform 100ms linear, background-color 200ms, opacity 200ms',
          }
        }

        const widthClass =
          variant === 'compact'
            ? 'w-0.5'
            : variant === 'player'
              ? 'w-[3px]'
              : 'w-1'

        const colorClass = isPlayed || isActive
          ? isNearPlayhead
            ? 'bg-cyan-300'
            : 'bg-gradient-to-t from-cyan-600 to-cyan-400'
          : variant === 'album'
            ? 'bg-gray-600 hover:bg-cyan-400'
            : 'bg-gray-700 group-hover:bg-gradient-to-t group-hover:from-cyan-600 group-hover:to-cyan-400'

        const opacity =
          isPlayed
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
          <button
            key={index}
            type="button"
            tabIndex={-1}
            aria-hidden
            disabled={!interactiveSeek || (!isCurrent && !onBarClick)}
            onClick={(event) => handleBarClick(event, index)}
            className={`${widthClass} shrink-0 rounded-sm ${colorClass} ${
              interactiveSeek && isCurrent ? 'cursor-pointer' : 'cursor-default'
            } ${barClassName}`}
            style={{ ...heightStyle, opacity }}
          />
        )
      })}
    </div>
  )
}
